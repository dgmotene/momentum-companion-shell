# myriad-rag

Standalone RAG service that transforms the 454-page Myriad policy guide into grounded, cited answers. Built with FastAPI, pgvector, and Momentum's AI Gateway.

**Key Feature:** Repository includes pre-ingested corpus (`../db/rag-corpus.sql.gz`) that loads automatically on first database boot, so you can test the companion **without running ingestion**.

```
PDF ──▶ extract ──▶ clean ──▶ chunk ──▶ embed ──▶ Postgres/pgvector
                                                        │
question ──▶ embed ──▶ top-k search ◀───────────────────┘
                          │
                          └──▶ prompt (rules + chunks) ──▶ chat model ──▶ answer + citations
```

## What's Included

✅ **Pre-loaded corpus** - 6,800+ chunks from Myriad guide, ready to query  
✅ **Parent/child chunking** - Search small pieces, retrieve full sections  
✅ **Citation tracking** - Section headings + page numbers in every answer  
✅ **Contextual honesty** - "I don't know" when similarity < threshold  
✅ **FastAPI server** - Production-ready HTTP API on :8080  
✅ **CLI tools** - Ingest new documents, preview chunks, inspect corpus  
✅ **Gateway integration** - OAuth2 client-credentials, Titan embeddings, Haiku chat

**For integration with companion backend, see [CONNECTING.md](CONNECTING.md).**

## Quick Start (Using Pre-Loaded Corpus)

The fastest path requires no Python setup:

```bash
# From momentum-companion-shell/ root
docker compose up -d db              # Loads pre-ingested corpus automatically
curl http://localhost:4000/health    # Companion backend uses RAG via internal client
```

The companion backend's `rag-client.mjs` talks to the RAG tables directly via SQL, so **no HTTP service needed for basic testing**. The FastAPI server is only required for:

- Standalone RAG API access (external consumers)
- Testing retrieval without the full companion stack
- Real-time corpus inspection via HTTP endpoints

## Setup (For Development)

### Option 1: HTTP Service (FastAPI)

```bash
cd rag
cp .env.example .env              # Fill in DATABASE_URL and gateway credentials
pip install -e ".[dev]"           # Installs myriad-rag package + dependencies
myriad-rag-serve                  # Starts FastAPI server on :8080
```

### Option 2: CLI Only (No Server)

```bash
cd rag
pip install -e .                  # Minimal install, no dev dependencies
python -m myriad_rag.cli --help   # Verify installation
```

### Environment Variables

```bash
# Required for all operations
RAG_DATABASE_URL=postgresql://companion:companion@localhost:5432/companion

# Required only for ingestion/querying (not needed if using pre-loaded corpus)
RAG_GATEWAY_BASE_URL=https://riskservicesdev.momentum.co.za/ai/api
RAG_API_KEY=<your-universal-api-key>

# Model selection
RAG_EMBED_MODEL=amazon.titan-embed-text-v2:0          # Must match ingested corpus
RAG_CHAT_MODEL=anthropic.claude-3-haiku-20240307-v1:0

# Retrieval tuning
RAG_MIN_SIMILARITY=0.2            # Threshold for "I don't know" responses
RAG_TOP_K=6                       # Number of chunks to retrieve (5-8 recommended)
RAG_PAGE_OFFSET=2                 # PDF page numbering adjustment

# Ingestion control
RAG_EMBED_BATCH_SIZE=1            # Keep at 1 (Bifrost gateway limitation)
RAG_EMBED_CONCURRENCY=1           # Sequential to avoid rate limits
```

## Usage

### Inspecting the Pre-Loaded Corpus

```bash
# Summary stats
python -m myriad_rag.cli stats

# View a random sample of chunks
python -m myriad_rag.cli sample --count 5

# List all unique parts/sections
python -m myriad_rag.cli parts
```

### Re-Ingesting from PDF (Optional)

**Only needed if you want to ingest a different document or test the pipeline.**

```bash
# Preview chunk boundaries on one section (no DB writes, no gateway spend)
python -m myriad_rag.cli chunks ./myriad-guide.pdf --pages 40-48

# Full ingestion (minutes, cents in gateway costs)
python -m myriad_rag.cli ingest ./myriad-guide.pdf

# Force re-ingest (warning: re-embeds everything, spending quota)
python -m myriad_rag.cli ingest ./myriad-guide.pdf --force
```

Re-running ingestion on the same file is a **no-op** by default unless you pass `--force`. This guard is deliberate: the embedding budget is spent per ingestion, and an accidental re-ingest buys you byte-identical vectors at real cost.

**Gateway realities baked into defaults:**
- Bifrost returns ONE vector per embeddings request no matter batch size → `RAG_EMBED_BATCH_SIZE=1`  
- Team rate limits trip fast → `RAG_EMBED_CONCURRENCY=1` with retries is most reliable
- Sequential ingestion of 454 pages takes ~5 minutes

## HTTP API (FastAPI Server)

```bash
myriad-rag-serve          # Starts on :8080
# or: uvicorn myriad_rag.api:app --host 0.0.0.0 --port 8080
```

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `POST /v1/query` | Chat turn | Returns answer + citations from grounded retrieval |
| `POST /v1/retrieve` | Internal | Chunks only, no model—for debugging retrieval |
| `POST /v1/ingest` | Admin | Kicks off background ingestion, returns 202 |
| `GET /v1/documents` | Stats | Ingestion status and chunk counts by document |
| `GET /v1/config` | Config | Frozen retrieval parameters (min similarity, top-k, models) |
| `GET /healthz` | Health | Liveness check (always returns 200) |
| `GET /readyz` | Ready | Readiness check (pings Postgres + verifies corpus exists) |

### Example: Query

```bash
curl -X POST http://localhost:8080/v1/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: ${RAG_API_KEY}" \
  -d '{"question": "What is the cooling-off period?"}'
```

Response:
```json
{
  "answer": "Per the Cooling-off section, the cooling-off period is 31 days from policy issue [1].",
  "citations": [
    {
      "marker": 1,
      "section": "Myriad Life Cover / Cooling-off Period",
      "source": "Myriad technical guide p.45",
      "printed_page": 45,
      "pdf_page": 47,
      "similarity": 0.876
    }
  ],
  "grounded": true,
  "query_lang": "eng_Latn",
  "chunks_retrieved": 3
}
```

### Example: Integration from Node.js Backend

See [CONNECTING.md](CONNECTING.md) for full integration guide. Quick example:

```javascript
import { queryRag } from './rag-client.mjs';

const result = await queryRag({
  question: userMessage,
  minSimilarity: 0.2,
  topK: 6
});

if (result.grounded) {
  // Use result.answer and result.citations
} else {
  // Fallback: "I can't confirm that from the provided documents"
}
```

## Design Notes (Read Before Modifying)

### Why Page Numbers Matter

**A page number alone is not a citation.** The guide restarts numbering at "Page 1" for each of its ~52 product sections, so roughly 52 pages are numbered "Page 3". Citations are therefore `(part, printed_page)` — "Education Protector, page 3" — with `pdf_page` kept as the unambiguous locator for deep links. 

The printed number is read from the page's own footer label, not computed; the `RAG_PAGE_OFFSET` arithmetic is only a fallback for unlabelled pages.

### Parent/Child Chunking Strategy

**Problem:** The guide is written as many short labelled fields ("Description", "Age limits"), which alone average ~30 tokens and retrieve badly. A query for "waiting period" would match field titles, not actual values.

**Solution:** 
1. Split on headings first (one parent section per product/clause)
2. Pack adjacent fields within each parent up to token budget (~400 tokens)
3. Never cross part boundaries (keeps context coherent)
4. Prefix each chunk with its section heading (topic survives splitting)

**Why it works:** Small children = precise matching. Full parents = complete context. Model never sees orphaned fragments.

### Chunks Lead With Their Heading

Splitting on headings first, then into ~400-token windows with overlap, and prefixing each window with its section title means a paragraph pulled from the middle of a section still carries its topic into the embedding.

### Boilerplate Detection (Not Hardcoded)

A line in the top/bottom band that recurs on more than half the pages gets stripped. The band scales with page length so short pages don't lose their body. This is why you don't see "Page 3 of 454" or "Momentum Life" headers polluting chunks.

### "I Don't Know" Has Two Paths

1. **Pre-model enforcement:** If nothing clears `RAG_MIN_SIMILARITY`, service returns fixed fallback without spending a chat call
2. **Model instruction:** System prompt requires "I don't know" when retrieved excerpts don't cover the question

This is contextual honesty by design, not by prompt hope.

### Question and Corpus Can't Drift Apart

Both read `RAG_EMBED_MODEL` from environment, and search filters on the model and dimension recorded at ingest. Point the service at a different embedding model and it returns "I don't know" rather than comparing vectors from different semantic spaces.

**Consequence:** To switch embedding models, you must re-ingest the entire corpus.

### The Model Never Sees The Full Guide

Only the top `RAG_TOP_K` chunks (default 6, configurable 3-10). This keeps prompts small for the small model (Haiku) and forces precision in retrieval. If the right sections aren't in top-6, the answer is wrong—which signals a retrieval problem, not a model problem.

## Troubleshooting

### "No chunks found in database"
```bash
# Verify corpus loaded
docker exec companion-db psql -U companion -d companion -c "SELECT COUNT(*) FROM rag_chunks;"
# Should show 6000-7000 rows

# If empty, reload corpus
cd momentum-companion-shell
docker compose down -v  # Destroys volume
docker compose up -d db # Reapplies seed.sql + rag-corpus.sql.gz
```

### "Embedding dimension mismatch"
You changed `RAG_EMBED_MODEL` after ingesting. The corpus was embedded with a different model (check `rag_documents.embed_dimension`). Solution: Re-ingest with `--force`.

### "Gateway 401 Unauthorized"
Check `RAG_API_KEY` matches your gateway credentials. Test directly:
```bash
curl -H "Authorization: Bearer $RAG_API_KEY" \
  https://riskservicesdev.momentum.co.za/ai/api/v1/models
```

### "Rate limit exceeded"
Gateway team quotas are strict. Solutions:
- Lower `RAG_EMBED_CONCURRENCY` to 1 (already default)
- Add longer delays between requests (edit `gateway.py` retry backoff)
- Batch ingestion across multiple days

### All answers return "I don't know"
- Check `RAG_MIN_SIMILARITY` not set too high (0.2 is reasonable, >0.5 is too strict)
- Verify you're querying about content actually in the guide
- Test retrieval directly: `POST /v1/retrieve` shows similarity scores

### Citations show wrong page numbers
- Check `RAG_PAGE_OFFSET` matches your PDF's footer offset (usually 2)
- Verify `printed_page` vs `pdf_page` in raw chunk data
- Re-ingest if offset was wrong during ingestion

## Performance Tuning

### Ingestion Speed
- **Bottleneck:** Gateway embedding API calls (sequential by design)
- **Cannot optimize:** Bifrost requires batch_size=1, rate limits enforce concurrency=1
- **Expected:** ~5 minutes for full 454-page guide

### Query Latency
- **Typical:** 200-800ms (embedding query + cosine search + model call)
- **Optimizations:**
  - Enable HNSW index: `CREATE INDEX ON rag_chunks USING hnsw (embedding vector_cosine_ops);`
  - Reduce `RAG_TOP_K` (3-5 instead of 6-8)
  - Cache frequent queries (not implemented, PRs welcome)

### Database Size
- **Current corpus:** ~450MB vectors + metadata
- **At scale (full guide):** ~1.2GB estimated
- **Pgvector overhead:** ~2x raw vector size with HNSW index

## Testing

### Preflight Check (Before Ingestion)
```bash
cd rag/scripts
python preflight.py  # Verifies gateway connectivity, OAuth2 flow, model availability
```

### Integration Test (After Ingestion)
```bash
# Query via HTTP
curl -X POST http://localhost:8080/v1/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the maximum cover amount?"}'

# Expected: grounded answer with citation, grounded=true
```

### Chunk Quality Inspection
```bash
# View chunks for specific section
python -m myriad_rag.cli chunks ./guide.pdf --pages 40-48

# Check chunk token lengths
python -m myriad_rag.cli stats --verbose
```

## Architecture Integration

This RAG service is **Zone 3b** in the full architecture:

```
Companion Backend (3a)          RAG Service (3b)
   chat.js orchestration    ──▶  FastAPI server :8080
   ├─ embed question via        ├─ pgvector search
   │  gateway client            ├─ swap children→parents  
   └─ compose grounded reply◀───┴─ return chunks + citations
```

**Two integration paths:**

1. **HTTP** (production-ready) - Backend calls `/v1/query`, service handles everything
2. **Direct SQL** (lower latency) - Backend's `rag-client.mjs` queries pgvector directly

See [CONNECTING.md](CONNECTING.md) for both approaches.

## Contributing

When modifying chunking logic:
1. Test on sample sections first: `python -m myriad_rag.cli chunks ./guide.pdf --pages 40-48`
2. Verify token counts stay under budget (~500 tokens/chunk max for Haiku)
3. Check citations still resolve to correct pages
4. Re-ingest full corpus with `--force` to validate at scale

## License

Part of Monkey & River Hackathon 2026 submission. See repository root for details.

---

For integration with the companion backend, see [CONNECTING.md](CONNECTING.md).

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
