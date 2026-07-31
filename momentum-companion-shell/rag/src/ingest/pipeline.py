"""Ingest orchestration: extract -> clean -> chunk -> embed -> store."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path

from ..config import Settings
from ..db import Database
from ..gateway import Gateway
from .chunk import chunk_pages
from .clean import clean_pages
from .extract import extract_pages, file_sha256

log = logging.getLogger(__name__)


@dataclass(slots=True)
class IngestResult:
    document_id: int
    pages: int
    chunks: int
    skipped: bool = False


async def _embed_all(
    gateway: Gateway, settings: Settings, texts: list[str]
) -> list[list[float]]:
    batches = [
        texts[i:i + settings.embed_batch_size]
        for i in range(0, len(texts), settings.embed_batch_size)
    ]
    sem = asyncio.Semaphore(settings.embed_concurrency)
    done = 0

    async def run(batch: list[str], idx: int):
        nonlocal done
        async with sem:
            vectors = await gateway.embed(batch)
        done += 1
        if done % 10 == 0 or done == len(batches):
            log.info("embedded %d/%d batches", done, len(batches))
        return idx, vectors

    results = await asyncio.gather(
        *(run(b, i) for i, b in enumerate(batches))
    )
    out: list[list[float]] = []
    for _, vectors in sorted(results, key=lambda t: t[0]):
        out.extend(vectors)
    return out


async def ingest_pdf(
    path: Path,
    *,
    db: Database,
    gateway: Gateway,
    settings: Settings,
    force: bool = False,
) -> IngestResult:
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(path)

    digest = file_sha256(path)

    # Re-embedding 454 pages costs real money and produces an identical corpus.
    # Refuse by default when the exact file and parameters are already stored.
    if not force:
        existing = await db.find_ready_document(digest)
        if existing:
            log.info(
                "already ingested as document %d (%d chunks) - use force to redo",
                existing["id"], existing["chunk_count"] or 0,
            )
            return IngestResult(
                document_id=existing["id"],
                pages=existing["page_count"] or 0,
                chunks=existing["chunk_count"] or 0,
                skipped=True,
            )

    pages = await asyncio.to_thread(
        extract_pages, path, page_offset=settings.page_offset
    )
    document_id = await db.create_document(
        source_name=path.name, sha256=digest, page_count=len(pages)
    )

    try:
        cleaned = clean_pages(pages, threshold=settings.boilerplate_threshold)
        chunks = chunk_pages(
            cleaned,
            chunk_tokens=settings.chunk_tokens,
            chunk_overlap=settings.chunk_overlap,
        )
        if not chunks:
            raise RuntimeError("no chunks produced - is there a text layer?")
        log.info("%d pages -> %d chunks", len(pages), len(chunks))

        vectors = await _embed_all(gateway, settings, [c.content for c in chunks])
        if len(vectors) != len(chunks):
            raise RuntimeError("embedding/chunk count mismatch")
        for v in vectors:
            if len(v) != settings.embed_dim:
                raise RuntimeError(
                    f"gateway returned dim {len(v)}, expected {settings.embed_dim}"
                )

        rows = [
            {
                "chunk_index": c.chunk_index,
                "section": c.section,
                "printed_page": c.printed_page,
                "pdf_page": c.pdf_page,
                "token_count": c.token_count,
                "content": c.content,
                "embedding": vec,
            }
            for c, vec in zip(chunks, vectors)
        ]
        await db.insert_chunks(document_id, rows)
        await db.finish_document(document_id, chunk_count=len(rows))
        log.info("document %d ready", document_id)
        return IngestResult(document_id=document_id, pages=len(pages),
                            chunks=len(rows))

    except Exception as exc:  # noqa: BLE001
        # Mark failed rather than leaving a half-corpus that queries would
        # happily search against.
        await db.finish_document(document_id, chunk_count=0, error=str(exc)[:2000])
        log.exception("ingest failed for %s", path.name)
        raise
