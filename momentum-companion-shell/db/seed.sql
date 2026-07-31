-- Database schema for the design round. Just tables and sample data, no app logic.
-- Runs automatically the first time the Postgres container starts.

CREATE EXTENSION IF NOT EXISTS vector;

-- Profiles: the fake users the host "logs in" as.
-- deceased_flag is each row's OWN status. A beneficiary's token instead
-- carries their linked policyholder's flag (resolved via linked_to); that
-- is the value that unlocks the restricted role.
CREATE TABLE IF NOT EXISTS profiles (
    id            TEXT PRIMARY KEY,             -- matches JWT `sub`
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN
                  ('policyholder', 'beneficiary', 'life_insured',
                   'adviser', 'claims_assessor', 'service_agent')),
    policy_id     TEXT,                         -- staff roles own no policy
    deceased_flag BOOLEAN NOT NULL DEFAULT FALSE,
    linked_to     TEXT REFERENCES profiles(id), -- beneficiary -> policyholder link
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which clients an adviser may see (read-only, once the adviser flow exists).
CREATE TABLE IF NOT EXISTS adviser_clients (
    adviser_id        TEXT NOT NULL REFERENCES profiles(id),
    client_profile_id TEXT NOT NULL REFERENCES profiles(id),
    PRIMARY KEY (adviser_id, client_profile_id)
);

-- Sessions: stores chat history. Needed because the AI gateway itself
-- doesn't remember past messages, so our backend has to.
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   TEXT NOT NULL REFERENCES profiles(id),
    role         TEXT NOT NULL,                -- role snapshot at session start
    history        JSONB NOT NULL DEFAULT '[]'::jsonb, -- rolling window of recent turns
    workflow_state JSONB NOT NULL DEFAULT '{}'::jsonb, -- pinned card: journey, fields collected, fields missing
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
-- Parent-child chunking: `content` holds the small child piece that gets
-- embedded and searched; `parent_section` names the full guide section that
-- gets injected into the prompt when this child matches.
CREATE TABLE IF NOT EXISTS documents (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source         TEXT NOT NULL,              -- e.g. 'Myriad technical guide p.12'
    parent_section TEXT,                       -- e.g. 'Cooling-off'
    chunk_index    INT NOT NULL,
    content        TEXT NOT NULL,
    embedding      vector(1024),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index so we can search documents by similarity (cosine distance) quickly.
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw
    ON documents USING hnsw (embedding vector_cosine_ops);

-- Policies: the actual policy record behind profiles.policy_id.
CREATE TABLE IF NOT EXISTS policies (
    policy_id             TEXT PRIMARY KEY,
    product_name          TEXT NOT NULL,
    sum_assured           NUMERIC(12, 2) NOT NULL,
    monthly_premium       NUMERIC(10, 2) NOT NULL,
    waiting_period_months INT NOT NULL DEFAULT 0,
    status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'claim_pending', 'lapsed')),
    start_date            DATE NOT NULL
);

-- Benefits attached to a policy (what "am I covered for X" answers come from).
CREATE TABLE IF NOT EXISTS policy_benefits (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id    TEXT NOT NULL REFERENCES policies(policy_id),
    benefit_name TEXT NOT NULL,
    cover_amount NUMERIC(12, 2) NOT NULL
);

-- Nominated beneficiaries on a policy (not the same as a beneficiary login).
CREATE TABLE IF NOT EXISTS policy_beneficiaries (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id    TEXT NOT NULL REFERENCES policies(policy_id),
    full_name    TEXT NOT NULL,
    relationship TEXT NOT NULL,
    percentage   INT NOT NULL CHECK (percentage BETWEEN 1 AND 100)
);

-- Residential address: the one field the companion may update end to end.
CREATE TABLE IF NOT EXISTS addresses (
    profile_id  TEXT PRIMARY KEY REFERENCES profiles(id),
    street      TEXT NOT NULL,
    suburb      TEXT NOT NULL,
    city        TEXT NOT NULL,
    province    TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Banking details are display-only (masked). Changes always go to a human,
-- so there are no full account numbers anywhere in this system.
CREATE TABLE IF NOT EXISTS banking_details (
    profile_id     TEXT PRIMARY KEY REFERENCES profiles(id),
    bank_name      TEXT NOT NULL,
    account_holder TEXT NOT NULL,
    account_last4  TEXT NOT NULL
);

-- Claims: tracked per policy so beneficiaries can follow progress.
CREATE TABLE IF NOT EXISTS claims (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id            TEXT NOT NULL REFERENCES policies(policy_id),
    claimant_profile_id  TEXT NOT NULL REFERENCES profiles(id),
    claim_type           TEXT NOT NULL CHECK (claim_type IN
                         ('death', 'funeral', 'income', 'disability', 'critical_illness')),
    status               TEXT NOT NULL DEFAULT 'awaiting_documents'
                         CHECK (status IN ('awaiting_documents', 'under_assessment', 'approved', 'paid', 'declined')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --- Mock profiles ------------------------------------------------------------
-- 1. Active policyholder (full access: Q&A, What-If, updates, claims).
INSERT INTO profiles (id, full_name, role, policy_id, deceased_flag)
VALUES ('user-001', 'Thandi Mokoena', 'policyholder', 'POL-1001', FALSE)
ON CONFLICT (id) DO NOTHING;

-- 2. Policyholder with deceased_flag = TRUE (unlocks the linked beneficiary's
--    restricted role).
INSERT INTO profiles (id, full_name, role, policy_id, deceased_flag)
VALUES ('user-002', 'Nomsa Dlamini', 'policyholder', 'POL-1002', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 3. Beneficiary linked to the deceased policyholder (restricted: Q&A + claims).
INSERT INTO profiles (id, full_name, role, policy_id, deceased_flag, linked_to)
VALUES ('user-003', 'Sipho Dlamini', 'beneficiary', 'POL-1002', FALSE, 'user-002')
ON CONFLICT (id) DO NOTHING;

-- 4. Beneficiary whose linked policyholder is ALIVE: every capability is No
--    until the deceased flag is verified.
INSERT INTO profiles (id, full_name, role, policy_id, deceased_flag, linked_to)
VALUES ('user-004', 'Bongani Mokoena', 'beneficiary', 'POL-1001', FALSE, 'user-001')
ON CONFLICT (id) DO NOTHING;

-- 5-8. Remaining personas from the finals brief, seeded but deny-by-default
--      until each gets a capability-matrix entry.
INSERT INTO profiles (id, full_name, role, policy_id, deceased_flag, linked_to)
VALUES
    ('user-005', 'Lindiwe Mokoena', 'life_insured', 'POL-1001', FALSE, 'user-001'),
    ('user-006', 'Pieter van der Merwe', 'adviser', NULL, FALSE, NULL),
    ('user-007', 'Naledi Khumalo', 'claims_assessor', NULL, FALSE, NULL),
    ('user-008', 'Ayesha Patel', 'service_agent', NULL, FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO adviser_clients (adviser_id, client_profile_id)
VALUES ('user-006', 'user-001'), ('user-006', 'user-002')
ON CONFLICT DO NOTHING;

-- --- Mock policies ------------------------------------------------------------
-- POL-1001 premiums are chosen so the What-If worked examples from
-- SUBMISSION.md demo live: R500k @ R300 -> R400k / 6-month wait = R216,
-- and -> R200k hits the R200 floor.
INSERT INTO policies (policy_id, product_name, sum_assured, monthly_premium, waiting_period_months, status, start_date)
VALUES
    ('POL-1001', 'Myriad Life Cover', 500000.00, 300.00, 0, 'active', '2022-03-01'),
    ('POL-1002', 'Myriad Life Cover', 750000.00, 450.00, 0, 'claim_pending', '2019-08-01')
ON CONFLICT (policy_id) DO NOTHING;

INSERT INTO policy_benefits (policy_id, benefit_name, cover_amount)
SELECT benefit.*
FROM (VALUES
    ('POL-1001', 'Death Benefit', 500000.00),
    ('POL-1001', 'Funeral Benefit', 50000.00),
    ('POL-1001', 'Complete Critical Illness Benefit', 200000.00),
    ('POL-1002', 'Death Benefit', 750000.00),
    ('POL-1002', 'Funeral Benefit', 50000.00)
) AS benefit(policy_id, benefit_name, cover_amount)
WHERE NOT EXISTS (SELECT 1 FROM policy_benefits);

INSERT INTO policy_beneficiaries (policy_id, full_name, relationship, percentage)
SELECT nominated.*
FROM (VALUES
    ('POL-1001', 'Lerato Mokoena', 'spouse', 100),
    ('POL-1002', 'Sipho Dlamini', 'son', 100)
) AS nominated(policy_id, full_name, relationship, percentage)
WHERE NOT EXISTS (SELECT 1 FROM policy_beneficiaries);

INSERT INTO addresses (profile_id, street, suburb, city, province, postal_code)
VALUES
    ('user-001', '12 Protea Street', 'Sunnyside', 'Pretoria', 'Gauteng', '0002'),
    ('user-003', '48 Marula Avenue', 'Umlazi', 'Durban', 'KwaZulu-Natal', '4031')
ON CONFLICT (profile_id) DO NOTHING;

INSERT INTO banking_details (profile_id, bank_name, account_holder, account_last4)
VALUES
    ('user-001', 'Standard Bank', 'T Mokoena', '4821'),
    ('user-003', 'Capitec', 'S Dlamini', '7739')
ON CONFLICT (profile_id) DO NOTHING;

-- One in-progress death claim so the beneficiary can track something.
INSERT INTO claims (policy_id, claimant_profile_id, claim_type, status)
SELECT 'POL-1002', 'user-003', 'death', 'awaiting_documents'
WHERE NOT EXISTS (SELECT 1 FROM claims);
