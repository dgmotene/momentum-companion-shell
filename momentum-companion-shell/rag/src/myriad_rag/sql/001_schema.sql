-- Myriad RAG schema. Lives in the existing Postgres; everything is namespaced
-- under the rag_ prefix so it cannot collide with application tables.

CREATE EXTENSION IF NOT EXISTS vector;

-- One row per ingestion run of one source document.
CREATE TABLE IF NOT EXISTS rag_documents (
    id              BIGSERIAL PRIMARY KEY,
    source_name     TEXT        NOT NULL,
    sha256          TEXT        NOT NULL,
    -- Frozen retrieval parameters, recorded so a query can refuse to run
    -- against a corpus embedded with a different model or dimension.
    embed_model     TEXT        NOT NULL,
    embed_dim       INTEGER     NOT NULL,
    chunk_tokens    INTEGER     NOT NULL,
    chunk_overlap   INTEGER     NOT NULL,
    page_offset     INTEGER     NOT NULL DEFAULT 1,  -- printed page = pdf page - offset
    page_count      INTEGER,
    chunk_count     INTEGER,
    status          TEXT        NOT NULL DEFAULT 'pending',  -- pending|running|ready|failed
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS rag_documents_active_uniq
    ON rag_documents (sha256, embed_model, chunk_tokens, chunk_overlap)
    WHERE status = 'ready';

CREATE TABLE IF NOT EXISTS rag_chunks (
    id            BIGSERIAL PRIMARY KEY,
    document_id   BIGINT      NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
    chunk_index   INTEGER     NOT NULL,
    part          TEXT,             -- product section; page numbers reset per part
    section       TEXT,
    printed_page  INTEGER,          -- the citation the user sees
    pdf_page      INTEGER   NOT NULL,
    token_count   INTEGER   NOT NULL,
    content       TEXT      NOT NULL,
    embedding     VECTOR(1024) NOT NULL,
    UNIQUE (document_id, chunk_index)
);

-- HNSW over cosine distance. Build AFTER the bulk insert on first ingest;
-- for a 454-page guide (~2-3k chunks) build time is a few seconds either way.
CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
    ON rag_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS rag_chunks_document_idx ON rag_chunks (document_id);

-- Optional lexical fallback / hybrid search hook. Cheap to keep, easy to ignore.
CREATE INDEX IF NOT EXISTS rag_chunks_content_fts_idx
    ON rag_chunks USING gin (to_tsvector('english', content));
