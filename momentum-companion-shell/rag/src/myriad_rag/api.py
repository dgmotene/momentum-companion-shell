"""HTTP surface. This is how the existing system talks to the RAG service.

    POST /v1/query          question -> answer + citations   (the chat-turn call)
    POST /v1/retrieve       question -> raw chunks, no model  (debug / reranking)
    POST /v1/ingest         start an ingest, returns a document id
    GET  /v1/documents      what has been ingested
    GET  /v1/config         the frozen retrieval parameters
    GET  /healthz /readyz   liveness and readiness

Auth is a shared secret in `X-API-Key`, checked with a constant-time compare.
Leave RAG_API_KEYS empty in local dev to disable it.
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .answer import Answerer
from .config import Settings, get_settings
from .db import Database
from .gateway import build_gateway
from .ingest.pipeline import ingest_pdf

log = logging.getLogger(__name__)


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    top_k: int | None = Field(default=None, ge=1, le=20)
    document_id: int | None = None


class IngestRequest(BaseModel):
    path: str
    force: bool = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    db = Database(settings)
    await db.open()
    await db.migrate()
    gateway = build_gateway(settings)

    app.state.settings = settings
    app.state.db = db
    app.state.gateway = gateway
    app.state.answerer = Answerer(db, gateway, settings)
    log.info("myriad-rag ready on %s:%d", settings.host, settings.port)
    try:
        yield
    finally:
        await gateway.aclose()
        await db.close()


app = FastAPI(title="Myriad RAG", version="0.1.0", lifespan=lifespan)


async def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    settings: Settings = app.state.settings
    allowed = settings.api_key_set
    if not allowed:
        return
    if not x_api_key or not any(
        hmac.compare_digest(x_api_key, k) for k in allowed
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or missing API key")


@app.get("/healthz")
async def healthz() -> dict:
    return {"status": "ok"}


@app.get("/readyz")
async def readyz() -> JSONResponse:
    ok = await app.state.db.healthy()
    return JSONResponse(
        {"status": "ok" if ok else "degraded", "database": ok},
        status_code=200 if ok else 503,
    )


@app.get("/v1/config", dependencies=[Depends(require_api_key)])
async def config() -> dict:
    s: Settings = app.state.settings
    return {
        **s.retrieval_fingerprint(),
        "top_k": s.top_k,
        "min_similarity": s.min_similarity,
        "chat_model": s.chat_model,
        "page_offset": s.page_offset,
        "note": "these are frozen; changing embed_model/chunk_* requires re-ingest",
    }


@app.post("/v1/query", dependencies=[Depends(require_api_key)])
async def query(req: QueryRequest) -> dict:
    answerer: Answerer = app.state.answerer
    result = await answerer.answer(
        req.question, top_k=req.top_k, document_id=req.document_id
    )
    return result.to_dict()


@app.post("/v1/retrieve", dependencies=[Depends(require_api_key)])
async def retrieve(req: QueryRequest) -> dict:
    answerer: Answerer = app.state.answerer
    chunks = await answerer.retrieve(
        req.question, top_k=req.top_k, document_id=req.document_id
    )
    return {
        "chunks": [
            {
                "chunk_id": c.chunk_id,
                "section": c.section,
                "printed_page": c.printed_page,
                "pdf_page": c.pdf_page,
                "similarity": round(c.similarity, 4),
                "content": c.content,
            }
            for c in chunks
        ]
    }


@app.post("/v1/ingest", dependencies=[Depends(require_api_key)],
          status_code=status.HTTP_202_ACCEPTED)
async def ingest(req: IngestRequest) -> dict:
    """Ingest runs in the background: a 454-page PDF takes minutes, far longer
    than any sane HTTP timeout. Poll /v1/documents for status."""
    path = Path(req.path)
    if not path.is_file():
        raise HTTPException(400, f"no such file: {path}")

    async def run():
        try:
            await ingest_pdf(
                path,
                db=app.state.db,
                gateway=app.state.gateway,
                settings=app.state.settings,
                force=req.force,
            )
        except Exception:  # noqa: BLE001
            log.exception("background ingest failed")

    asyncio.create_task(run())
    return {"status": "accepted", "source": path.name}


@app.get("/v1/documents", dependencies=[Depends(require_api_key)])
async def documents() -> dict:
    rows = await app.state.db.list_documents()
    return {"documents": rows}


def main() -> None:
    import sys
    import uvicorn

    # psycopg's async pool needs the selector loop; Windows defaults to the
    # proactor loop, under which pool connections never complete.
    if sys.platform == "win32":
        import asyncio

        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    s = get_settings()
    uvicorn.run("myriad_rag.api:app", host=s.host, port=s.port, log_level=s.log_level.lower())


if __name__ == "__main__":
    main()
