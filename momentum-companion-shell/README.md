# Accessible Life Insurance AI Companion - Environment Shell

Design-round skeleton for the Hackathon 2026 virtual phase. No AI features are
implemented yet. This repo just proves the environment is set up and shows how
the pieces fit together. See `SUBMISSION.md` for the full plan.

## What this skeleton demonstrates

Four trust zones, structurally separated:

| Zone | Path | Port | Role |
|---|---|---|---|
| Host (parent portal) | `host/` | 3000 | Mock-authenticates the user, signs an RS256 identity JWT server-side, embeds the companion in an `<iframe>`, hands the token over via origin-targeted `postMessage`. |
| Embedded companion | `companion/` | 3001 | Separate Next.js app (separate origin). No login of its own. Validates `postMessage` origin against an allowlist, displays decoded claims, forwards the raw JWT to its backend. |
| Companion backend | `companion-backend/` | 4000 | Serves a mock JWKS and **verifies** the JWT (signature, issuer, audience, expiry). This is the only real logic in the repo right now. It will be the sole holder of the Momentum AI Gateway OAuth2 credentials. All other routes are labeled stubs. |
| External AI Gateway | n/a | n/a | Not called yet in this phase. `POST /api/gateway-ping` is a stub for where the gateway client will live. |

The end-user identity token and the gateway machine credentials are two
separate secrets that never cross boundaries. The private key is only read by
the host's server-side API route. The gateway credentials are env vars only
read by `companion-backend`.

## Prerequisites

- Node.js 20+
- Docker (for the database path) **or** a local Postgres 15+ with the
  `pgvector` extension

## Quick start (Docker database, recommended)

```bash
git clone <repo-url> && cd momentum-companion-shell

# 1. Generate the mock RS256 keypair (writes keys/private.pem, keys/public.pem)
npm run setup

# 2. Boot Postgres 15 + pgvector; seed.sql applies automatically on first boot
docker-compose up -d db

# 3. Install dependencies for all three services
npm run install:all

# 4. Run the three services (three terminals, or use & / a process manager)
npm run dev:backend      # companion-backend  -> http://localhost:4000
npm run dev:companion    # companion frontend -> http://localhost:3001
npm run dev:host         # host portal        -> http://localhost:3000
```

Then open **http://localhost:3000**, click **Log in as Policyholder** or
**Log in as Beneficiary**, and watch the embedded companion receive the token
and report backend verification.

Sanity checks:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/.well-known/jwks.json
docker exec -it companion-db psql -U companion -d companion -c "SELECT id, role, deceased FROM profiles;"
```

### Everything in Docker (optional)

```bash
npm run setup
docker-compose --profile full up
```

First start is slow (each container runs `npm install`). The plain-npm dev loop
above is the recommended path.

## Fallback: no Docker (local Postgres)

```bash
# 1. Create the database and enable pgvector, then apply the schema + seeds
createdb companion
psql -d companion -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d companion -f db/seed.sql

# 2. Point DATABASE_URL at your instance
cp .env.example .env   # edit DATABASE_URL if your credentials differ

# 3. Same as above
npm run setup
npm run install:all
npm run dev:backend
npm run dev:companion
npm run dev:host
```

## Environment variables

Every variable referenced anywhere in the codebase is listed in
`.env.example` with placeholder values. **Do not commit real secrets.** The
gateway OAuth2 client-credentials (`GATEWAY_OAUTH_CLIENT_ID` /
`GATEWAY_OAUTH_CLIENT_SECRET`) are read only by `companion-backend` and are
never referenced in any frontend code.

## Repository map

```
.
├── docker-compose.yml          # pgvector db (primary), optional full profile
├── db/seed.sql                 # schema: profiles, sessions, audit_log, documents(vector 1024)
├── scripts/generate-keys.mjs   # setup: self-signed RS256 keypair -> keys/ (git-ignored)
├── host/                       # Zone 1: mock portal, signs the token at /api/token
├── companion/                  # Zone 2: embedded child app, listens for the token
└── companion-backend/          # Zone 3: JWKS + verify route + stub routes
```

Every stub route has a short comment saying what it's for, so you can follow
the repo without needing to open `SUBMISSION.md`.
