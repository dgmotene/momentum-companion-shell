-- Database schema for the design round. Just tables and sample data, no app logic.
-- Runs automatically the first time the Postgres container starts.

CREATE EXTENSION IF NOT EXISTS vector;

-- Profiles: the fake users the host "logs in" as.
-- The deceased flag decides if a linked beneficiary gets restricted access.
CREATE TABLE IF NOT EXISTS profiles (
    id           TEXT PRIMARY KEY,             -- matches JWT `sub`
    full_name    TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('policyholder', 'beneficiary')),
    policy_id    TEXT NOT NULL,
    deceased     BOOLEAN NOT NULL DEFAULT FALSE,
    linked_to    TEXT REFERENCES profiles(id), -- beneficiary -> policyholder link
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions: stores chat history. Needed because the AI gateway itself
-- doesn't remember past messages, so our backend has to.
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   TEXT NOT NULL REFERENCES profiles(id),
    role         TEXT NOT NULL,                -- role snapshot at session start
    history      JSONB NOT NULL DEFAULT '[]'::jsonb, -- appended/trimmed turn log
    summary      TEXT,                         -- rolling summary once trimmed
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit log: a record of what each user did, whether it was allowed, and why.
CREATE TABLE IF NOT EXISTS audit_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id        TEXT REFERENCES profiles(id),
    policy_id         TEXT,
    role              TEXT,
    action            TEXT NOT NULL,
    auth_result       TEXT,
    validation_result TEXT,
    handoff_flag      BOOLEAN NOT NULL DEFAULT FALSE,
    reason            TEXT,
    session_id        UUID REFERENCES sessions(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documents + embeddings: for searching policy docs later (pgvector).
-- vector(1024) matches the default size for Titan's embedding model.
-- Double check this against the real gateway response before the finals,
-- since Titan can also output smaller vectors (256/512) if asked.
CREATE TABLE IF NOT EXISTS documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source       TEXT NOT NULL,                -- e.g. 'Myriad technical guide p.12'
    chunk_index  INT NOT NULL,
    content      TEXT NOT NULL,
    embedding    vector(1024),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index so we can search documents by similarity (cosine distance) quickly.
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw
    ON documents USING hnsw (embedding vector_cosine_ops);

-- --- Mock profiles ------------------------------------------------------------
-- 1. Active policyholder (full access: Q&A, What-If, updates, claims).
INSERT INTO profiles (id, full_name, role, policy_id, deceased)
VALUES ('user-001', 'Thandi Mokoena', 'policyholder', 'POL-1001', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 2. Policyholder with deceased = TRUE (triggers beneficiary promotion).
INSERT INTO profiles (id, full_name, role, policy_id, deceased)
VALUES ('user-002', 'Sipho Dlamini', 'policyholder', 'POL-1002', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Beneficiary linked to the deceased policyholder (restricted: Q&A + claims).
INSERT INTO profiles (id, full_name, role, policy_id, deceased, linked_to)
VALUES ('user-003', 'Naledi Dlamini', 'beneficiary', 'POL-1002', FALSE, 'user-002')
ON CONFLICT (id) DO NOTHING;
