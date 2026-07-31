# Myriad guide ingestion flow

From the 454-page PDF to grounded, cited answers. Two halves: ingest once, query every chat turn.

## Ingest (once)

```mermaid
flowchart LR
    A[PDF] --> B[Extract text<br/>per page]
    B --> C[Clean]
    C --> D[Chunk<br/>~400 tokens]
    D --> E[Embed<br/>titan-v2]
    E --> F[(Postgres<br/>pgvector)]
```

- **Extract**: keep page numbers, they become the citations (printed page = PDF page - 1).
- **Clean**: strip repeated headers/footers so they do not pollute retrieval.
- **Chunk**: split on section headings first, then ~400-token pieces with overlap; tag section + page.
- **Embed**: batch through the gateway with retry/backoff; one-time cost, cents.
- **Store**: pgvector in our existing Postgres, nothing new to run.

## Query (every chat turn)

```mermaid
flowchart LR
    Q[User question] --> E[Embed question<br/>same titan-v2]
    E --> S[Top-k search<br/>in pgvector]
    S --> P[Prompt:<br/>rules + chunks + question]
    P --> M[Chat model<br/>via gateway]
    M --> A[Answer + citations<br/>section, page]
```

- Question and corpus must use the same embedding model.
- Prompt rule: answer only from the excerpts, otherwise say "I don't know".
- Model only ever sees the top 5-8 chunks, never the whole guide.

## Tuning note

Chunk size and top-k get frozen after the Sprint 0 spike on one section; every full re-ingestion re-spends embedding budget.
