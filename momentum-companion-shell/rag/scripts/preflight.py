"""Preflight: test each hop separately so a failure tells you which one broke.

    python scripts/preflight.py            # gateway + database
    python scripts/preflight.py --query "what does the Death Benefit cover?"

Every stage prints PASS/FAIL and keeps going where it can, so one run tells you
everything that is wrong rather than only the first thing.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

sys.path.insert(0, "src")

from myriad_rag.answer import Answerer  # noqa: E402
from myriad_rag.config import get_settings  # noqa: E402
from myriad_rag.db import Database  # noqa: E402
from myriad_rag.gateway import build_gateway  # noqa: E402

OK, BAD = "PASS", "FAIL"
results: list[tuple[str, str, str]] = []


def record(stage: str, ok: bool, detail: str = "") -> bool:
    results.append((OK if ok else BAD, stage, detail))
    print(f"[{OK if ok else BAD}] {stage}" + (f" - {detail}" if detail else ""))
    return ok


async def main(query: str | None) -> int:
    s = get_settings()

    print("=== configuration ===")
    print(f"  gateway     {s.gateway_base_url}")
    print(f"  virtual key {'set (' + s.gateway_virtual_key[:9] + '...)' if s.gateway_virtual_key else 'MISSING'}")
    print(f"  embed model {s.embed_model}")
    print(f"  chat model  {s.chat_model}")
    print(f"  database    {s.database_url.split('@')[-1]}")
    print(f"  api keys    {'set' if s.api_key_set else 'OPEN (no auth)'}")
    print()

    record("virtual key present", bool(s.gateway_virtual_key),
           "set RAG_GATEWAY_VIRTUAL_KEY" if not s.gateway_virtual_key else "")

    gateway = build_gateway(s)
    db = Database(s)

    # --- 1. gateway: embeddings -----------------------------------------
    dim = None
    try:
        t0 = time.perf_counter()
        vectors = await gateway.embed(["preflight check"])
        dim = len(vectors[0])
        record("gateway embeddings", True,
               f"dim={dim}, {1000 * (time.perf_counter() - t0):.0f}ms")
    except Exception as exc:  # noqa: BLE001
        record("gateway embeddings", False, f"{type(exc).__name__}: {exc}")

    # The stored vector column is fixed-width. A mismatch here means every
    # insert would fail halfway through ingest, after spending the budget.
    if dim is not None:
        record("embedding dimension matches RAG_EMBED_DIM", dim == s.embed_dim,
               f"gateway returned {dim}, config says {s.embed_dim}"
               if dim != s.embed_dim else "")

    # --- 2. gateway: chat ------------------------------------------------
    try:
        t0 = time.perf_counter()
        reply = await gateway.chat(
            "Reply with exactly the word: ready", "Say it."
        )
        record("gateway chat", True,
               f"{1000 * (time.perf_counter() - t0):.0f}ms, replied {reply[:40]!r}")
    except Exception as exc:  # noqa: BLE001
        record("gateway chat", False, f"{type(exc).__name__}: {exc}")

    # --- 3. database ------------------------------------------------------
    corpus_ready = False
    try:
        await db.open()
        record("database connection", True)
        try:
            await db.migrate()
            record("pgvector extension + schema", True)
        except Exception as exc:  # noqa: BLE001
            record("pgvector extension + schema", False,
                   f"{type(exc).__name__}: {exc}")

        docs = await db.list_documents()
        ready = [d for d in docs if d["status"] == "ready"]
        corpus_ready = bool(ready)
        if ready:
            d = ready[0]
            record("corpus ingested", True,
                   f"{d['source_name']}: {d['chunk_count']} chunks, "
                   f"{d['page_count']} pages, model={d['embed_model']}")
            model_matches = (
                d["embed_model"] == s.embed_model and d["embed_dim"] == s.embed_dim
            )
            record("corpus model matches current config", model_matches,
                   "" if model_matches else
                   "corpus and config disagree - queries will return nothing")
        else:
            record("corpus ingested", False,
                   "nothing ready yet - run: python -m myriad_rag.cli ingest <pdf>")
    except Exception as exc:  # noqa: BLE001
        record("database connection", False, f"{type(exc).__name__}: {exc}")

    # --- 4. end to end ----------------------------------------------------
    if query and corpus_ready:
        try:
            t0 = time.perf_counter()
            result = await Answerer(db, gateway, s).answer(query)
            record("end-to-end query", True,
                   f"{time.perf_counter() - t0:.1f}s, grounded={result.grounded}, "
                   f"{len(result.citations)} citation(s)")
            print("\n--- answer ---")
            print(result.answer)
            for c in result.citations:
                print(f"  [{c.marker}] {c.label()}  sim={c.similarity}")
        except Exception as exc:  # noqa: BLE001
            record("end-to-end query", False, f"{type(exc).__name__}: {exc}")

    try:
        await gateway.aclose()
        await db.close()
    except Exception:  # noqa: BLE001
        pass

    failed = [r for r in results if r[0] == BAD]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    # psycopg's async pool needs the selector loop; Windows defaults to the
    # proactor loop, under which pool connections never complete. And the
    # guide's extracted text carries characters the legacy cp1252 console
    # encoding can't print.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("--query", help="also run one end-to-end question")
    args = ap.parse_args()
    raise SystemExit(asyncio.run(main(args.query)))
