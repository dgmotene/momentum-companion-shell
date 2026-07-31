# myriad-rag

Standalone service that turns the 454-page Myriad guide into grounded, cited
answers. Ingest once; query every chat turn.

```
PDF ──▶ extract ──▶ clean ──▶ chunk ──▶ embed ──▶ Postgres/pgvector
                                                        │
question ──▶ embed ──▶ top-k search ◀───────────────────┘
                          │
                          └──▶ prompt (rules + chunks) ──▶ chat model ──▶ answer + citations
```

**Connecting it to the companion: see [CONNECTING.md](CONNECTING.md).**

## Setup

```bash
cp .env.example .env      # fill in DATABASE_URL, gateway, API key
pip install -e ".[dev]"
```

Postgres needs the `vector` extension available; the service applies
`src/myriad_rag/sql/001_schema.sql` itself on startup. Everything lives under
the `rag_` prefix in the existing database — nothing new to run.

### No local Python? Run everything via Docker

With the compose db up (`docker compose up -d db` from `momentum-companion-shell/`),
run any CLI command through a throwaway container on the compose network:

```bash
docker run --rm --network momentum-companion-shell_default \
  -v "$PWD":/app -w /app -v "/path/to/myriad-technical-guide.pdf":/data/myriad.pdf:ro \
  python:3.12-slim sh -c "pip install -q . && python -m myriad_rag.cli ingest /data/myriad.pdf"
```

Set `RAG_DATABASE_URL=postgresql://companion:companion@db:5432/companion` in
`.env` for this setup.

## Ingest

```bash
# Sprint 0 spike: preview chunk boundaries on one section. No DB, no spend.
python -m myriad_rag.cli chunks ./myriad-guide.pdf --pages 40-48

# The real thing (minutes, cents)
python -m myriad_rag.cli ingest ./myriad-guide.pdf
```

Re-running on the same file is a no-op unless you pass `--force`. That guard is
deliberate: the embedding budget is spent per ingestion, and an accidental
re-ingest buys you a byte-identical corpus.

Two gateway realities baked into the defaults: Bifrost returns ONE vector per
embeddings request no matter how many inputs you send, so `RAG_EMBED_BATCH_SIZE`
must stay 1; and the team rate limit trips fast, so `RAG_EMBED_CONCURRENCY=1`
with extra retries is the reliable setting. Sequential ingest of all 454 pages
takes a few minutes.

## Serve

```bash
myriad-rag-serve          # or: docker build -t myriad-rag . && docker run ...
```

## Talking to it from the current system

HTTP, shared secret in `X-API-Key`. One call per chat turn:

```python
r = httpx.post(
    "http://myriad-rag:8080/v1/query",
    headers={"X-API-Key": RAG_KEY},
    json={"question": user_message},
    timeout=30,
)
data = r.json()
data["answer"]      # prose with [1], [2] markers inline
data["citations"]   # [{marker, section, printed_page, pdf_page, similarity}]
data["grounded"]    # False when it answered "I don't know"
```

Render `citations` however the UI wants — `printed_page` is the number the
reader sees on the page, already offset from the PDF page.

| Endpoint | Purpose |
|---|---|
| `POST /v1/query` | the chat-turn call: answer + citations |
| `POST /v1/retrieve` | chunks only, no model — for debugging retrieval |
| `POST /v1/ingest` | kick off a background ingest, returns 202 |
| `GET /v1/documents` | ingest status and chunk counts |
| `GET /v1/config` | the frozen retrieval parameters |
| `GET /healthz`, `/readyz` | liveness, readiness (readiness pings Postgres) |

## Design notes worth knowing before you change something

**A page number alone is not a citation.** The guide restarts numbering at
"Page 1" for each of its ~52 product sections, so roughly 52 pages are numbered
"Page 3". Citations are therefore `(part, printed_page)` — "Education Protector,
page 3" — with `pdf_page` kept as the unambiguous locator for deep links. The
printed number is read from the page's own footer label, not computed; the
`RAG_PAGE_OFFSET` arithmetic is only a fallback for unlabelled pages.

**Chunks are packed, not just split.** The guide is written as many short
labelled fields ("Description", "Age limits"), which alone average ~30 tokens
and retrieve badly. Adjacent fields are merged up to the token budget, never
across a part boundary.

**Boilerplate is detected, not hardcoded.** A line in the top/bottom band that
recurs on more than half the pages gets stripped. The band scales with page
length so short pages don't lose their body.

**Chunks lead with their heading.** Splitting on headings first, then into
~400-token windows with overlap, and prefixing each window with its section
title — a paragraph pulled from the middle of a section still carries its topic
into the embedding.

**Question and corpus can't drift apart.** Both read `RAG_EMBED_MODEL`, and the
search filters on the model and dimension recorded at ingest. Point the service
at a different embedding model and it returns "I don't know" rather than
comparing vectors from two different spaces.

**"I don't know" has two paths.** If nothing clears `RAG_MIN_SIMILARITY` the
service says it without spending a chat call. Otherwise the system prompt makes
it the required answer when the excerpts don't cover the question.

**The model never sees the guide.** Only the top `RAG_TOP_K` chunks (default 6,
spec range 5–8).

## Frozen parameters

`embed_model`, `embed_dim`, `chunk_tokens`, `chunk_overlap` are frozen after the
Sprint 0 spike. Changing any of them invalidates every stored vector and means
re-spending the embedding budget on all 454 pages. `top_k` and `min_similarity`
are safe to tune live — they only affect query time.

## Tokenizer in containers

Chunk sizing uses tiktoken's `cl100k_base`, which downloads on first use. In an
air-gapped image, pre-bake it:

```dockerfile
ENV TIKTOKEN_CACHE_DIR=/opt/tiktoken
RUN python -c "import tiktoken; tiktoken.get_encoding('cl100k_base').encode('x')"
```

Without it the service logs a warning and falls back to a whitespace tokenizer,
which runs roughly 25% under the true count. Titan tokenises differently from
cl100k anyway — the count is a chunking heuristic, not a billing figure.

## Tests

```bash
python -m pytest tests -q
```

Covers boilerplate detection, heading splitting, page-offset arithmetic,
overlap, and prompt assembly. No database or gateway required.
