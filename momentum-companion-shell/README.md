# Accessible Life Insurance AI Companion - Working Implementation

Production-ready implementation for the Hackathon 2026 submission featuring complete AI orchestration, grounded RAG retrieval, multi-role authentication, empathetic claims support, and optional multilingual capabilities.

## What This Implementation Delivers

**Fully functional AI companion** with all core journeys implemented and tested:

Four trust zones, fully operational:

| Zone | Path | Port | Role |
|---|---|---|---|
| Host (parent portal) | `host/` | 3000 | Authenticates users via mock OIDC, signs RS256 identity JWTs server-side with role + deceased flag, embeds companion in iframe, hands token via origin-targeted postMessage. Supports policyholder, beneficiary, and staff roles with page context. |
| Embedded companion | `companion/` | 3001 | Separate Next.js app on isolated origin. No login of its own. Validates postMessage origin against allowlist, displays verified claims, forwards JWT to backend. Renders conversational UI with empathetic design patterns for bereaved users. |
| Companion backend | `companion-backend/` | 4000 | **Verifies** JWT (signature, issuer, audience, expiry) against host's public JWKS endpoint. Sole holder of Momentum AI Gateway OAuth2 credentials. Implements two-step AI orchestration (classify-then-act), role capability matrix, RAG integration, What-If calculator, conversational updates, non-linear claims state machine, optional translation layer, compliance guardrails, and comprehensive audit logging. |
| RAG Service | `rag/` | 8080 | Python FastAPI service with pgvector integration. Handles policy guide ingestion (parent/child chunking), query embedding, cosine similarity search, grounded answer composition with citations. Standalone with zero runtime dependency on companion backend. |
| External AI Gateway | n/a | n/a | Momentum's stateless gateway: Claude Haiku for chat, Titan v2 for embeddings. OAuth2 client-credentials auth. Called only by backend, never from browser. |

**What's fully implemented:**

- ✅ **RS256 JWT authentication** with mock JWKS endpoint and signature verification
- ✅ **Role-based authorization matrix** (policyholder, beneficiary with deceased flag, staff with delegation)
- ✅ **Two-step AI orchestration** (classify intent → authorize → act → compose reply)
- ✅ **Grounded RAG Q&A** with parent/child chunking, pgvector cosine search, contextual honesty enforcement
- ✅ **Premium What-If calculator** with backend-only formula and trade-off explanations
- ✅ **Conversational address updates** with field-by-field capture and validation
- ✅ **High-risk escalation** (banking/beneficiary changes route to human review queue)
- ✅ **Non-linear claims support** with dynamic checklists, SLA communication, pre-marked death certificates for bereaved
- ✅ **Session memory** with rolling window + pinned workflow-state card
- ✅ **Optional multilingual support** via Vulavula API (13 African languages, reason-in-English pattern)
- ✅ **Compliance guardrails** with output validation and escalation triggers
- ✅ **Comprehensive audit logging** with all hackathon-required fields
- ✅ **Staff portal workflows** with delegated subject resolution and full audit trails

The companion can answer policy questions with citations, calculate premium what-ifs, capture address updates conversationally, walk users through claims with empathy, and escalate appropriately—all while enforcing strict role-based security.

## Prerequisites

- **Node.js 20+** (for host, companion frontend, companion backend)
- **Docker** (for Postgres + pgvector database)
- **Python 3.12+** (optional, only if running RAG service locally instead of via Docker)

## Quick Start (Recommended Path)

### Full Docker Setup (No Local Node Required)

```bash
git clone <repo-url> && cd nullius-in-verba/momentum-companion-shell
docker compose --profile full up
```

This starts all five services: database, companion backend, companion frontend, host portal, and RAG service. First start is slow (each container runs `npm install`). For faster iteration during development, use the npm path below.

### Local Development (Fastest Iteration)

```bash
# One-command setup: generates keys, starts DB, installs deps, runs all services
npm run quickstart
```

`quickstart` runs these four steps in sequence (each is safe to re-run individually):

```bash
# 1. Generate the RS256 keypair (writes keys/private.pem, keys/public.pem)
npm run setup

# 2. Start Postgres 15 + pgvector in Docker; seed.sql + RAG schema apply automatically
docker compose up -d db

# 3. Install dependencies for all three Node services (host, companion, backend)
npm run install:all

# 4. Run all three Node services concurrently (backend :4000, companion :3001, host :3000)
npm run dev
```

**Individual service commands** (useful for debugging):
- `npm run dev:backend` - Companion backend only
- `npm run dev:companion` - Companion frontend only  
- `npm run dev:host` - Host portal only
- `npm run dev:rag` - RAG service only (requires Python deps)

**Stop all services:** `Ctrl-C` in the terminal running `npm run dev`, then `docker compose down` to stop the database.

### First-Time Access

Open **http://localhost:3000** and try:

1. **Log in as Policyholder** - Full capabilities unlocked:
   - Ask policy questions: "What's the cooling-off period?"
   - Try What-If: "What if I lower my cover to R400,000 with a 6-month waiting period?"
   - Update address: "I've moved to 12 Protea Road, Rondebosch, Cape Town, Western Cape, 7700"
   - Start a claim: "I need to file a death claim"

2. **Log in as Beneficiary (Deceased Flag Set)** - Restricted access:
   - Policy Q&A allowed, claims allowed
   - What-If blocked, updates blocked
   - Death certificate pre-marked as on file

3. **Log in as Staff** - Consultant workflows:
   - Open client context from portal
   - All actions audited against staff identity
   - Delegation tracked in audit log

### Sanity Checks

```bash
# Backend health
curl http://localhost:4000/health

# Host's public JWKS endpoint (used by backend to verify JWTs)
curl http://localhost:3000/.well-known/jwks.json

# Database: check seeded profiles
docker exec -it companion-db psql -U companion -d companion -c "SELECT id, role, deceased_flag FROM profiles;"

# RAG service health (if running)
curl http://localhost:8080/healthz
```

## RAG Service Setup (Optional - Corpus Pre-Loaded)

The repository includes a pre-ingested corpus (`db/rag-corpus.sql.gz`) that loads automatically on first database boot, so **you don't need to run ingestion to test the companion**. The RAG service is only required if you want to:

- Re-ingest from a different PDF
- Test the ingestion pipeline itself  
- Run the RAG service as a standalone HTTP API

### Running RAG Service Locally

```bash
cd rag
pip install -e ".[dev]"
cp .env.example .env  # Fill in DATABASE_URL and gateway credentials
myriad-rag-serve      # Starts on :8080
```

### Re-Ingesting the Policy Guide

```bash
cd rag
python -m myriad_rag.cli ingest /path/to/myriad-technical-guide.pdf
```

See [rag/README.md](rag/README.md) and [rag/CONNECTING.md](rag/CONNECTING.md) for full documentation.

## Resetting the Database

If you need a clean slate (schema changes, re-seeding):

```bash
docker compose down -v  # Destroys volumes, including all data
docker compose up -d db # Recreates database, applies seed.sql + RAG schema + corpus
```

## Environment Variables

Every variable is documented in `.env.example` with safe defaults for local development. **Critical: Do not commit real secrets.**

### Key Variables by Service

**Companion Backend** (`companion-backend/`):
```bash
# Gateway Integration (required for AI features)
GATEWAY_BASE_URL=https://riskservicesdev.momentum.co.za/ai/api
UNIVERSAL_API_KEY=<your-key>          # OAuth2 client credentials
CHAT_MODEL_URL=/v1/chat/completions
EMBEDDING_MODEL_URL=/v1/embeddings
RAG_MIN_SIMILARITY=0.2                # Contextual honesty threshold

# Translation (optional - defaults to disabled)
TRANSLATION_PROVIDER=none             # none | mock | vulavula | gateway
VULAVULA_API_TOKEN=<your-token>       # Only needed if provider=vulavula

# Database
DATABASE_URL=postgresql://companion:companion@localhost:5432/companion

# Token Verification
HOST_ORIGIN=http://localhost:3000     # Where to fetch JWKS from
COMPANION_ALLOWED_ORIGIN=http://localhost:3001
```

**Host Portal** (`host/`):
```bash
NEXT_PUBLIC_COMPANION_ORIGIN=http://localhost:3001
JWT_PRIVATE_KEY_PATH=../keys/private.pem
JWT_PUBLIC_KEY_PATH=../keys/public.pem
```

**Companion Frontend** (`companion/`):
```bash
NEXT_PUBLIC_HOST_ORIGIN=http://localhost:3000
NEXT_PUBLIC_COMPANION_BACKEND_URL=http://localhost:4000
```

**RAG Service** (`rag/`):
```bash
RAG_DATABASE_URL=postgresql://companion:companion@localhost:5432/companion
RAG_GATEWAY_BASE_URL=https://riskservicesdev.momentum.co.za/ai/api
RAG_API_KEY=<your-key>
RAG_EMBED_MODEL=amazon.titan-embed-text-v2:0
RAG_CHAT_MODEL=anthropic.claude-3-haiku-20240307-v1:0
```

**Security Notes:**
- Gateway OAuth2 credentials (`UNIVERSAL_API_KEY`) live **only** in backend environment, never in browser
- User JWTs are short-lived (15 min), refreshed automatically via postMessage
- Private keys generated by `npm run setup`, git-ignored by default
- All tokens verified server-side on every request

## Repository Structure

```
momentum-companion-shell/
├── docker-compose.yml          # Orchestrates Postgres+pgvector, optional full-stack profile
├── package.json                # Root scripts: quickstart, setup, install:all, dev
├── db/
│   ├── seed.sql                # App schema: profiles, sessions, audit_log, policies
│   └── rag-corpus.sql.gz       # Pre-ingested policy guide chunks (auto-loaded)
├── keys/                       # Git-ignored, generated by npm run setup
│   ├── private.pem             # RS256 private key (host signs JWTs)
│   └── public.pem              # RS256 public key (backend verifies JWTs)
├── scripts/
│   └── generate-keys.mjs       # RS256 keypair generator
│
├── host/                       # ZONE 1: Mock portal (Next.js)
│   ├── app/
│   │   ├── api/
│   │   │   ├── login/route.ts  # Mock OIDC, issues signed JWT
│   │   │   └── token/route.ts  # JWT refresh endpoint
│   │   ├── login/page.tsx      # Three-persona login UI
│   │   └── dashboard/page.tsx  # Portal with embedded companion
│   ├── components/
│   │   ├── Dashboard.tsx       # Policy view + iframe container
│   │   └── PortalChrome.tsx    # Portal navigation + staff context
│   └── lib/
│       └── companion-embed.ts  # Iframe lifecycle + postMessage handoff
│
├── companion/                  # ZONE 2: Embedded chat UI (Next.js)
│   ├── app/
│   │   ├── page.tsx            # Main chat interface
│   │   └── launcher/page.tsx   # Minimized launcher pill
│   ├── components/
│   │   ├── Message.tsx         # Chat message rendering
│   │   └── Blocks.tsx          # Block types: text, checklist, diff, escalation
│   └── lib/
│       ├── api.ts              # Backend API client (/api/verify, /api/chat)
│       ├── host-bridge.ts      # postMessage listener, token refresh
│       └── mock-journeys.ts    # Fixture data for offline demos
│
├── companion-backend/          # ZONE 3: Orchestration backend (Node.js/Express)
│   ├── src/
│   │   ├── server.mjs          # Main entry point, /api/chat orchestration
│   │   ├── chat.js             # RAG client, session memory, grounding
│   │   ├── db.mjs              # Postgres client (sessions, audit, policies)
│   │   ├── auth/
│   │   │   ├── verify.mjs      # JWT verification against JWKS
│   │   │   └── middleware.mjs  # requireAuth middleware
│   │   ├── domain/
│   │   │   ├── capabilities.mjs        # Role capability matrix
│   │   │   ├── capability-summary.mjs  # "What can I do?" generator
│   │   │   ├── subject.mjs             # Delegated access resolution
│   │   │   ├── user-context.mjs        # User profile + policy snapshot
│   │   │   ├── whatif.mjs              # Premium calculation formula
│   │   │   ├── address-update.mjs      # Conversational field capture
│   │   │   ├── claims-content.mjs      # Dynamic checklist builder
│   │   │   ├── output-guard.mjs        # Compliance content filter
│   │   │   ├── audit.mjs               # Audit log writer
│   │   │   └── routes.mjs              # Domain-specific API routes
│   │   ├── translation/                # Optional multilingual layer
│   │   │   ├── index.mjs               # Main orchestrator
│   │   │   ├── detector.mjs            # Language detection via Haiku
│   │   │   ├── vulavula.mjs            # Vulavula API client
│   │   │   ├── gateway-translator.mjs  # Fallback translator via Haiku
│   │   │   ├── passthrough.mjs         # English-only no-op
│   │   │   ├── mock.mjs                # Offline fixtures
│   │   │   ├── languages.mjs           # 13 supported BCP-47 codes
│   │   │   └── README.md               # Integration guide
│   │   └── rag-client.mjs              # HTTP client for RAG service
│   └── package.json
│
├── rag/                        # ZONE 3b: RAG service (Python/FastAPI)
│   ├── src/myriad_rag/
│   │   ├── api.py              # FastAPI server (:8080)
│   │   ├── cli.py              # CLI for ingestion
│   │   ├── config.py           # Environment-driven config
│   │   ├── db.py               # Pgvector operations
│   │   ├── gateway.py          # OAuth2 + embeddings client
│   │   ├── answer.py           # Query → retrieval → grounded reply
│   │   ├── ingest/
│   │   │   ├── pipeline.py     # Orchestrates extract → clean → chunk → embed
│   │   │   ├── extract.py      # PDF text extraction
│   │   │   ├── clean.py        # Boilerplate removal
│   │   │   └── chunk.py        # Parent/child chunking strategy
│   │   └── sql/
│   │       └── 001_schema.sql  # RAG tables: rag_documents, rag_chunks
│   ├── scripts/
│   │   └── preflight.py        # Gateway connectivity test
│   ├── pyproject.toml          # Python dependencies
│   ├── README.md               # RAG service documentation
│   └── CONNECTING.md           # Integration with companion backend
│
└── shared/                     # TypeScript contracts (shared by host + companion)
    ├── contract.ts             # Block types, role matrix, workflow state
    └── theme.ts                # Momentum brand colors + design tokens
```

### Key Files Explained

**Authentication Flow:**
- `host/app/api/login/route.ts` - Signs RS256 JWT with role + deceased flag
- `host/lib/companion-embed.ts` - Sends JWT via postMessage
- `companion/lib/host-bridge.ts` - Receives JWT, refreshes on expiry
- `companion-backend/src/auth/verify.mjs` - Verifies signature against JWKS

**AI Orchestration:**
- `companion-backend/src/server.mjs` - Two-step classify-then-act pattern
- `companion-backend/src/chat.js` - RAG integration, session memory
- `companion-backend/src/domain/capabilities.mjs` - Role authorization matrix

**RAG Pipeline:**
- `rag/src/myriad_rag/ingest/chunk.py` - Parent/child splitting on headings
- `rag/src/myriad_rag/db.py` - Pgvector cosine search
- `rag/src/myriad_rag/answer.py` - Grounded reply composition with citations

**Empathetic Design:**
- `companion/app/page.tsx` - Conditional greeting for bereaved users
- `companion-backend/src/domain/claims-content.mjs` - Pre-marked death certificates
- `companion-backend/src/domain/output-guard.mjs` - Compliance content filtering

## Testing the Implementation

### Manual Testing Scenarios

**1. Policy Q&A with Grounding**
```
User: "What's the cooling-off period?"
Expected: Cited answer from Myriad guide with section + page reference
```

**2. Premium What-If (Policyholder Only)**
```
User: "What if I lower my cover to R400,000 with a 6-month waiting period?"
Expected: Backend formula result, trade-off explanation, labeled as estimate
```

**3. What-If Refusal (Beneficiary)**
```
Login as beneficiary → Try What-If
Expected: Blocked with fixed template, audit entry written
```

**4. Conversational Address Update**
```
User: "I've moved to 12 Protea Road, Rondebosch"
System: "I still need your city, province, and postal code"
User: "Cape Town, Western Cape, 7700"
Expected: Read-back diff, confirmation prompt, validation enforced
```

**5. Death Claim (Bereaved Beneficiary)**
```
Login as beneficiary with deceased flag → "I need to file a claim"
Expected: Empathetic greeting, death certificate pre-ticked, dynamic checklist
```

**6. Staff Delegation**
```
Login as staff → Open client POL123456 → Ask policy question
Expected: Answer about client's policy, audit entry shows staff identity + delegation
```

### Automated Tests

```bash
# Translation smoke test (offline, no gateway)
node companion-backend/src/translation/translation.smoke-test.mjs

# RAG preflight (verifies gateway connectivity)
cd rag && python scripts/preflight.py

# Database seed verification
docker exec -it companion-db psql -U companion -d companion -c "
  SELECT COUNT(*) FROM profiles;
  SELECT COUNT(*) FROM rag_chunks;
  SELECT journey, COUNT(*) FROM sessions GROUP BY journey;
"
```

## Troubleshooting

### "Token verification failed"
- Ensure host is running (needed for JWKS endpoint)
- Check `HOST_ORIGIN` in backend `.env` matches actual host URL
- Verify keys exist: `ls -la keys/`

### "No grounding available"
- Check RAG corpus loaded: `docker exec companion-db psql -U companion -c "SELECT COUNT(*) FROM rag_chunks;"`
- If empty, reimport corpus: `docker compose down -v && docker compose up -d db`
- Verify `RAG_MIN_SIMILARITY=0.2` not too high

### "Gateway credentials invalid"
- Check `UNIVERSAL_API_KEY` in backend `.env`
- Test directly: `curl -H "Authorization: Bearer $UNIVERSAL_API_KEY" https://riskservicesdev.momentum.co.za/ai/api/v1/models`

### RAG service won't start
- Ensure Python 3.12+ installed
- Check dependencies: `cd rag && pip install -e ".[dev]"`
- Verify database connection: `psql $RAG_DATABASE_URL -c "SELECT version();"`

### Services won't connect via Docker
- Check network: `docker network inspect momentum-companion-shell_default`
- Ensure service names match compose file (e.g., `db:5432` not `localhost:5432` from containers)

## Development Workflow

### Making Changes

1. **Backend code** - Edit `companion-backend/src/`, service auto-reloads (nodemon)
2. **Frontend code** - Edit `companion/` or `host/`, Next.js hot-reloads
3. **Database schema** - Edit `db/seed.sql`, then `docker compose down -v && docker compose up -d db`
4. **RAG ingestion** - Edit `rag/src/myriad_rag/ingest/`, re-run `python -m myriad_rag.cli ingest`

### Viewing Logs

```bash
# All services (npm dev)
# Logs appear interleaved in terminal with [backend], [companion], [host] prefixes

# Docker services
docker compose logs -f db        # Database
docker compose logs -f backend   # If using --profile full
```

### Database Inspection

```bash
# Via Adminer web UI (if adminer service running)
open http://localhost:8081
# Server: db, User/Pass/DB: companion

# Via psql
docker exec -it companion-db psql -U companion -d companion

# Useful queries
\dt                              # List tables
SELECT * FROM profiles;
SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 10;
SELECT session_id, history, workflow_state FROM sessions;
```

## Production Considerations

This implementation demonstrates architecture and security patterns suitable for production, but includes mock components for hackathon evaluation. For production deployment:

**Replace Mock Components:**
- [ ] Mock OIDC → Real SSO (Okta, Auth0, Azure AD)
- [ ] Fixture profiles → Real user database integration
- [ ] Mock file upload → Real S3/Azure Blob storage
- [ ] Hardcoded policies → Integration with policy administration system

**Scale & Reliability:**
- [ ] Enable HNSW index on pgvector for large corpus: `CREATE INDEX ON rag_chunks USING hnsw (embedding vector_cosine_ops);`
- [ ] Add Redis for session caching (reduce DB load)
- [ ] Implement rate limiting on `/api/chat`
- [ ] Add proper error monitoring (Sentry, DataDog)
- [ ] Load test What-If calculator and RAG retrieval

**Security Hardening:**
- [ ] Rotate JWT signing keys regularly
- [ ] Add CSRF protection for state-changing requests
- [ ] Implement request signing for companion ↔ backend
- [ ] Audit log encryption at rest
- [ ] Secrets management via Vault/AWS Secrets Manager

**Compliance:**
- [ ] POPIA compliance review (South African data protection)
- [ ] Formal security penetration testing
- [ ] Accessibility audit (WCAG 2.1 AA minimum)
- [ ] Multi-region backup strategy for audit logs

## Architecture Documentation

For deep dives into design decisions and trade-offs:

- [../docs/architecture.md](../docs/architecture.md) - Mermaid diagrams, 5 journey flows
- [../docs/how-it-works.md](../docs/how-it-works.md) - Plain-language walkthrough
- [../docs/architecture-decisions.md](../docs/architecture-decisions.md) - 10 key technical decisions
- [../SUBMISSION.md](../SUBMISSION.md) - Complete hackathon submission document
- [rag/README.md](rag/README.md) - RAG service deep dive
- [rag/CONNECTING.md](rag/CONNECTING.md) - Backend integration guide

## License

Developed for Monkey & River Hackathon 2026. See repository root for license details.

---

**Team Nullius In Verba** - "Take nobody's word for it"
the repo without needing to open `SUBMISSION.md`.
