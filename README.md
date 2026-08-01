# Accessible Life Insurance AI Companion - Lumina


## live application: lumina.skaftin.uk

Team **Nullius In Verba**'s submission for the Monkey & River Hackathon 2026: **Lumina**, an empathetic AI companion embedded in Momentum's member portal, serving both policyholders managing their life cover and bereaved beneficiaries navigating claims.

## What is Lumina?

Lumina is a production-ready AI assistant that demonstrates how life insurance can be truly accessible and compassionate. It answers policy questions grounded in the actual Myriad guide, simulates premium What-Ifs, captures updates conversationally, and walks claims with patience—with every action gated by role-based security that adapts to the user's identity and the sensitive deceased flag.

**Our core design principle:** The model advises, the code decides. The backend consults Claude Haiku at most twice per message—once to classify intent, once to phrase results—and neither call carries authority. Every permission check, calculation, and refusal is deterministic code. This is what makes a small model safe for grieving people and every outcome auditable.

## Key Features Implemented

✅ **Multi-Role Authentication** - RS256 JWT with mock JWKS endpoint, role-based capability matrix, deceased flag logic  
✅ **Grounded Policy Q&A (RAG)** - Pgvector-powered retrieval with parent/child chunking strategy, contextual honesty enforcement  
✅ **Premium What-If Calculator** - Backend-only formula with trade-off explanations, always labeled as estimates  
✅ **Conversational Updates** - Address changes captured field-by-field, high-risk updates (banking/beneficiary) escalated to human review  
✅ **Empathetic Claims Support** - Non-linear state machine, dynamic document checklist, pre-marking death certificates for bereaved users  
✅ **Multilingual Support** - Optional translation layer supporting 13 African languages via Vulavula API (Lelapa)  
✅ **Compliance & Safety** - Output guardrails, audit logging with hackathon-required fields, human escalation triggers  
✅ **Staff Portal Access** - Delegated subject resolution, consultant workflows with full audit trails

## Where Everything Lives

| Artifact | Location |
|---|---|
| **Hackathon Submission Document** (primary scored artifact) | [SUBMISSION.md](SUBMISSION.md) |
| **Architecture Diagram** (4 trust zones + credential flows) | [architecture-diagram.html](architecture-diagram.html) - [view online](https://host-html.com/p/kpzzj1) |
| **Wireframes** (Lumina UI with empathetic design) | [lumina-wireframe.html](lumina-wireframe.html) - [view online](https://host-html.com/p/quv3tz) |
| **Architecture as Mermaid** (sequence diagrams + flows) | [docs/architecture.md](docs/architecture.md) |
| **Plain-Language Walkthrough** | [docs/how-it-works.md](docs/how-it-works.md) |
| **Architecture Decisions** (10 key trade-offs explained) | [docs/architecture-decisions.md](docs/architecture-decisions.md) |
| **Compliance Testing** | [docs/compliance-prompt.md](docs/compliance-prompt.md), [docs/compliance-test-run.md](docs/compliance-test-run.md) |
| **RAG Ingestion Flow** | [docs/rag-ingestion-flow.md](docs/rag-ingestion-flow.md) |
| **Working Implementation** | [momentum-companion-shell/](momentum-companion-shell/) |

## Quick Start

### Option 1: Docker (Recommended - No Local Setup Required)

```bash
git clone https://github.com/MnR-Hackathon-Group-C/nullius-in-verba.git
cd nullius-in-verba/momentum-companion-shell
docker compose --profile full up
```

This starts all services (Postgres+pgvector, companion backend, host portal, embedded companion) in one command.

### Option 2: Local Development (Fastest Iteration)

**Prerequisites:** Node.js 20+, Docker (for database only)

```bash
cd nullius-in-verba/momentum-companion-shell
npm run quickstart
```

This runs the four setup steps automatically:
1. Generates RS256 keypair for JWT signing
2. Starts Postgres+pgvector in Docker
3. Installs dependencies for all services
4. Runs all three Node services concurrently

### Access the Application

Open **http://localhost:3000** and:
- Click **Log in as Policyholder** to experience full capabilities (Q&A, What-If, updates, claims)
- Click **Log in as Beneficiary** to see the restricted role with deceased flag handling
- Click **Log in as Staff** to test consultant workflows with delegated access

Watch the embedded companion receive its JWT, verify it with the backend, and interact using the actual RAG pipeline with grounded, cited answers.

## Architecture Highlights

### Four Trust Zones
1. **Host Portal** (Zone 1) - Mock OIDC, issues RS256 JWT with role + deceased flag
2. **Embedded Companion** (Zone 2) - Iframe on separate origin, receives JWT via postMessage
3. **Companion Backend** (Zone 3) - Verifies JWT on every request, enforces role matrix, orchestrates AI
4. **AI Gateway** (Zone 4) - Momentum's stateless gateway (Haiku chat + Titan embeddings)

### Two-Step AI Orchestration
Unlike frameworks that assume tool-calling (which the gateway lacks), we built custom orchestration:
- **Call 1:** Classify intent only (`qa | whatif | update | claim | capabilities`)
- **Role Check:** Backend enforces capability matrix (e.g., beneficiaries blocked from What-If)
- **Action:** Backend code runs formula/retrieval/validation—model never decides authority
- **Call 2:** Phrase the result warmly, with empathy guardrails for bereaved users

### RAG with Parent/Child Chunking
- **Ingest:** Policy guide split on headings into parent sections (kept whole), sub-split into small child chunks
- **Retrieve:** Query embedded, matched against children for precision (top 3-5 by cosine similarity)
- **Ground:** Children swapped for full parents before prompting—model sees complete clauses, not fragments
- **Honesty:** If nothing scores above threshold, backend declines with approved fallback, model never called

## Project Structure

```
nullius-in-verba/
├── SUBMISSION.md              # Primary hackathon submission document
├── docs/                      # Architecture, decisions, compliance testing
│   ├── architecture.md        # Mermaid diagrams + 5 journey flows
│   ├── how-it-works.md        # Plain-language walkthrough
│   ├── architecture-decisions.md  # 10 key technical trade-offs
│   ├── compliance-prompt.md   # Guardrail system prompt
│   └── compliance-test-run.md # Validation results
└── momentum-companion-shell/  # Working implementation
    ├── host/                  # Zone 1: Mock portal, JWT signing
    ├── companion/             # Zone 2: Iframe UI, postMessage handoff
    ├── companion-backend/     # Zone 3: Node.js backend, orchestration
    │   └── src/
    │       ├── auth/          # JWT verification (RS256 + JWKS)
    │       ├── domain/        # Role matrix, claims, What-If, updates
    │       ├── translation/   # Optional multilingual support (Vulavula)
    │       ├── server.mjs     # Main orchestration + /api/chat
    │       └── chat.js        # RAG client, session memory, grounding
    ├── rag/                   # Zone 3b: Python RAG service (standalone)
    │   ├── src/myriad_rag/    # Ingestion pipeline + FastAPI server
    │   └── CONNECTING.md      # Integration guide
    ├── db/                    # Postgres seed (profiles, policies, audit schema)
    └── shared/                # TypeScript contracts (blocks, roles, workflow state)
```

## Technology Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Backend Runtime | Node.js (Express) | Avoids gateway's Python SDK bug, one language across stack |
| Frontend | Next.js (TypeScript) | Separate origins for host + companion iframe |
| Vector Store | Postgres + pgvector | Native cosine search, transactional consistency, built-in scale (HNSW) |
| RAG Service | Python (FastAPI) | Standalone ingestion script, better PDF tooling |
| Database | PostgreSQL 15 | ACID transactions for audit log, concurrent writes, vector extension |
| AI Models | Claude Haiku (chat), Titan v2 (embeddings) | Gateway-provided, small model designed for narrow jobs |
| Translation | Vulavula API (optional) | 13 African languages, reason-in-English pattern |
| Orchestration | Custom two-step | Hand-rolled classify-then-act, no framework overhead |

## What Makes This Unique

**1. Security-First Architecture**  
Two credentials that never meet: user JWT (who the human is) stops at our backend; gateway machine credentials (which app is calling) never enter the browser. RS256 signing means the backend can verify any token but never forge one.

**2. Empathy by Design**  
The hardest moments (condolences, refusals) use fixed human-written templates. The model phrases routine content but never improvises where a mistake would hurt most. Deceased flag pre-marks death certificates so bereaved users are never asked for documents the insurer already verified.

**3. Small Model, Big Safety**  
One small job per call. Haiku never reasons + decides + writes in one breath. State lives in backend session memory, not model context. Structured output is validated with bounded retries, falling back to XML tags when JSON fails.

**4. Grounded, Not Guessed**  
If retrieval finds nothing relevant, the backend declines before the model speaks. Citations reference actual section headings and page numbers. Estimates are labeled as estimates by code, never by hoping the model remembers.

**5. Auditable by Default**  
Every authorization decision, validation result, escalation trigger, and high-risk flag written to audit log with hackathon-required fields: user, policy, role, action, auth result, hand-off flag, reason, session ID.

## Testing & Validation

- **Compliance Testing:** [docs/compliance-test-run.md](docs/compliance-test-run.md) - Validation against output guardrails
- **Translation Smoke Test:** `momentum-companion-shell/companion-backend/src/translation/translation.smoke-test.mjs`
- **RAG Preflight:** `momentum-companion-shell/rag/scripts/preflight.py` - Verifies gateway connectivity before ingestion

## Team Nullius In Verba

| Member | Responsibility |
|--------|----------------|
| Vutomi Khosa | Problem framing, Lumina introduction |
| Thabani Hlatshwayo | Architecture design, key trade-offs |
| Dalton Motene | Access control, deceased flag logic |
| Katlego Mtimane | Grounded AI, empathetic claims |
| Modise Mogane | Trade-offs, finals roadmap |

## Next Steps for Finals

- Full 454-page Myriad guide ingestion (infrastructure ready, corpus committed)
- Real file upload handling (claims documents)
- Production gateway integration (OAuth2 flow complete, endpoints stubbed)
- HNSW index for scale (pgvector native support)
- Enhanced multilingual testing across all 13 supported languages

## License & Hackathon Context

This project was developed for the Monkey & River Hackathon 2026 virtual phase. All code and documentation demonstrate architecture, security, and empathetic AI design principles suitable for production life insurance systems.

For detailed technical documentation, see [SUBMISSION.md](SUBMISSION.md) and [docs/](docs/).

---

**"Nullius in verba"** - *Take nobody's word for it.* We verify every claim, cite every source, and audit every decision.
