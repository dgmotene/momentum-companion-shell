"""CLI: ingest the guide, or ask a question without going through HTTP.

    python -m myriad_rag.cli ingest ./myriad-guide.pdf
    python -m myriad_rag.cli ask "how do I escalate a rejected claim?"
    python -m myriad_rag.cli chunks ./myriad-guide.pdf --pages 40-48   # dry run
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from dataclasses import asdict
from pathlib import Path

from .answer import Answerer
from .config import get_settings
from .db import Database
from .gateway import build_gateway
from .ingest.chunk import chunk_pages
from .ingest.clean import clean_pages
from .ingest.extract import extract_pages
from .ingest.pipeline import ingest_pdf


async def _cmd_ingest(args) -> None:
    s = get_settings()
    db = Database(s)
    await db.open()
    await db.migrate()
    gateway = build_gateway(s)
    try:
        result = await ingest_pdf(
            Path(args.pdf), db=db, gateway=gateway, settings=s, force=args.force
        )
        print(json.dumps(asdict(result), indent=2))
    finally:
        await gateway.aclose()
        await db.close()


async def _cmd_ask(args) -> None:
    s = get_settings()
    db = Database(s)
    await db.open()
    gateway = build_gateway(s)
    try:
        result = await Answerer(db, gateway, s).answer(args.question, top_k=args.top_k)
        print(result.answer)
        if result.citations:
            print("\nSources:")
            for c in result.citations:
                page = c.printed_page if c.printed_page is not None else c.pdf_page
                print(f"  [{c.marker}] {c.section or '(no section)'} - p.{page} "
                      f"(sim {c.similarity})")
    finally:
        await gateway.aclose()
        await db.close()


def _cmd_chunks(args) -> None:
    """No database, no gateway, no spend. This is the Sprint 0 spike tool:
    run it on one section, eyeball the chunk boundaries, then freeze the knobs."""
    s = get_settings()
    pages = extract_pages(Path(args.pdf), page_offset=s.page_offset)
    if args.pages:
        lo, _, hi = args.pages.partition("-")
        lo, hi = int(lo), int(hi or lo)
        pages = [p for p in pages if lo <= p.pdf_page <= hi]
    cleaned = clean_pages(pages, threshold=s.boilerplate_threshold)
    chunks = chunk_pages(
        cleaned, chunk_tokens=s.chunk_tokens, chunk_overlap=s.chunk_overlap
    )
    print(f"{len(pages)} pages -> {len(chunks)} chunks "
          f"(size={s.chunk_tokens}, overlap={s.chunk_overlap})\n")
    for c in chunks[: args.limit]:
        page = c.printed_page if c.printed_page is not None else c.pdf_page
        print(f"--- #{c.chunk_index} | {c.section or '(no section)'} | p.{page} "
              f"| {c.token_count} tok")
        print(c.content[:400].replace("\n", " ") + "\n")


def main() -> None:
    # psycopg's async pool needs the selector loop; Windows defaults to the
    # proactor loop, under which pool connections never complete. And the
    # guide's extracted text carries characters (minus signs, etc.) that the
    # legacy cp1252 console encoding can't print.
    import sys

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="myriad-rag")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("ingest", help="extract, chunk, embed and store a PDF")
    p.add_argument("pdf")
    p.add_argument("--force", action="store_true",
                   help="re-embed even if this exact file is already stored")

    p = sub.add_parser("ask", help="one-off grounded question")
    p.add_argument("question")
    p.add_argument("--top-k", type=int, default=None)

    p = sub.add_parser("chunks", help="preview chunking without embedding")
    p.add_argument("pdf")
    p.add_argument("--pages", help="pdf page range, e.g. 40-48")
    p.add_argument("--limit", type=int, default=10)

    args = parser.parse_args()
    if args.cmd == "chunks":
        _cmd_chunks(args)
    elif args.cmd == "ingest":
        asyncio.run(_cmd_ingest(args))
    else:
        asyncio.run(_cmd_ask(args))


if __name__ == "__main__":
    main()
