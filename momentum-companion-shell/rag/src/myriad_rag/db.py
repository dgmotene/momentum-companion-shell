"""Postgres access. Async psycopg3 pool; vectors are passed as literals and
cast server-side, so no extra type-registration dependency is needed."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from .config import Settings

log = logging.getLogger(__name__)

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "sql" / "001_schema.sql"


def to_vector_literal(vec: Sequence[float]) -> str:
    return "[" + ",".join(f"{v:.7g}" for v in vec) + "]"


@dataclass(slots=True)
class Retrieved:
    chunk_id: int
    part: str | None
    section: str | None
    printed_page: int | None
    pdf_page: int
    content: str
    similarity: float


class Database:
    def __init__(self, settings: Settings):
        self.s = settings
        self.pool = AsyncConnectionPool(
            conninfo=settings.database_url,
            min_size=settings.db_pool_min,
            max_size=settings.db_pool_max,
            open=False,
            kwargs={"row_factory": dict_row},
        )

    async def open(self) -> None:
        await self.pool.open()
        await self.pool.wait()

    async def close(self) -> None:
        await self.pool.close()

    async def migrate(self) -> None:
        sql = SCHEMA_PATH.read_text()
        # The schema hardcodes VECTOR(1024) for Titan v2; honour a configured
        # override so a 256/512-dim deployment still works.
        if self.s.embed_dim != 1024:
            sql = sql.replace("VECTOR(1024)", f"VECTOR({self.s.embed_dim})")
        async with self.pool.connection() as conn:
            await conn.execute(sql)
        log.info("schema ready (dim=%d)", self.s.embed_dim)

    # -- ingest ----------------------------------------------------------

    async def create_document(
        self, *, source_name: str, sha256: str, page_count: int
    ) -> int:
        async with self.pool.connection() as conn:
            row = await (
                await conn.execute(
                    """
                    INSERT INTO rag_documents
                      (source_name, sha256, embed_model, embed_dim, chunk_tokens,
                       chunk_overlap, page_offset, page_count, status)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'running')
                    RETURNING id
                    """,
                    (
                        source_name, sha256, self.s.embed_model, self.s.embed_dim,
                        self.s.chunk_tokens, self.s.chunk_overlap,
                        self.s.page_offset, page_count,
                    ),
                )
            ).fetchone()
            return row["id"]

    async def find_ready_document(self, sha256: str) -> dict[str, Any] | None:
        async with self.pool.connection() as conn:
            return await (
                await conn.execute(
                    """
                    SELECT * FROM rag_documents
                    WHERE sha256=%s AND status='ready' AND embed_model=%s
                      AND chunk_tokens=%s AND chunk_overlap=%s
                    """,
                    (sha256, self.s.embed_model, self.s.chunk_tokens,
                     self.s.chunk_overlap),
                )
            ).fetchone()

    async def insert_chunks(self, document_id: int, rows: list[dict]) -> None:
        if not rows:
            return
        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.executemany(
                    """
                    INSERT INTO rag_chunks
                      (document_id, chunk_index, part, section, printed_page,
                       pdf_page, token_count, content, embedding)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)
                    ON CONFLICT (document_id, chunk_index) DO NOTHING
                    """,
                    [
                        (
                            document_id, r["chunk_index"], r["part"], r["section"],
                            r["printed_page"], r["pdf_page"], r["token_count"],
                            r["content"], to_vector_literal(r["embedding"]),
                        )
                        for r in rows
                    ],
                )

    async def finish_document(
        self, document_id: int, *, chunk_count: int, error: str | None = None
    ) -> None:
        async with self.pool.connection() as conn:
            await conn.execute(
                """
                UPDATE rag_documents
                   SET status=%s, chunk_count=%s, error=%s, completed_at=now()
                 WHERE id=%s
                """,
                ("failed" if error else "ready", chunk_count, error, document_id),
            )

    async def get_document(self, document_id: int) -> dict[str, Any] | None:
        async with self.pool.connection() as conn:
            return await (
                await conn.execute(
                    "SELECT * FROM rag_documents WHERE id=%s", (document_id,)
                )
            ).fetchone()

    async def list_documents(self) -> list[dict[str, Any]]:
        async with self.pool.connection() as conn:
            return await (
                await conn.execute(
                    "SELECT * FROM rag_documents ORDER BY created_at DESC LIMIT 50"
                )
            ).fetchall()

    # -- query -----------------------------------------------------------

    async def search(
        self,
        embedding: Sequence[float],
        *,
        top_k: int,
        min_similarity: float,
        document_id: int | None = None,
    ) -> list[Retrieved]:
        """Cosine similarity = 1 - cosine distance. Only chunks embedded with
        the model currently configured are eligible; a corpus embedded with a
        different model is silently skipped rather than compared nonsensically."""
        params: list[Any] = [to_vector_literal(embedding)]
        where = ["d.status='ready'", "d.embed_model=%s", "d.embed_dim=%s"]
        params += [self.s.embed_model, self.s.embed_dim]
        if document_id is not None:
            where.append("d.id=%s")
            params.append(document_id)
        params += [to_vector_literal(embedding), min_similarity,
                   to_vector_literal(embedding), top_k]

        sql = f"""
            SELECT c.id, c.part, c.section, c.printed_page, c.pdf_page, c.content,
                   1 - (c.embedding <=> %s::vector) AS similarity
              FROM rag_chunks c
              JOIN rag_documents d ON d.id = c.document_id
             WHERE {' AND '.join(where)}
               AND 1 - (c.embedding <=> %s::vector) >= %s
             ORDER BY c.embedding <=> %s::vector
             LIMIT %s
        """
        async with self.pool.connection() as conn:
            rows = await (await conn.execute(sql, params)).fetchall()
        return [
            Retrieved(
                chunk_id=r["id"], part=r["part"], section=r["section"],
                printed_page=r["printed_page"], pdf_page=r["pdf_page"],
                content=r["content"], similarity=float(r["similarity"]),
            )
            for r in rows
        ]

    async def healthy(self) -> bool:
        try:
            async with self.pool.connection() as conn:
                await conn.execute("SELECT 1")
            return True
        except Exception:  # noqa: BLE001
            return False
