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
| Companion backend | `companion-backend/` | 4000 | **Verifies** the JWT (signature, issuer, audience, expiry) against the public key the host publishes at `/.well-known/jwks.json`. This is the only real logic in the repo right now. It will be the sole holder of the Momentum AI Gateway OAuth2 credentials. All other routes are labeled stubs. |
| External AI Gateway | n/a | n/a | Not called yet in this phase. `POST /api/gateway-ping` is a stub for where the gateway client will live. |

The shell embeds the companion as a single direct iframe; the full design
delivers it via a small loader script (launcher pill + chat panel), as
documented in SUBMISSION.md section 5.3.

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
git clone <repo-url> && cd nullius-in-verba/momentum-companion-shell

# 1. Generate the mock RS256 keypair (writes keys/private.pem, keys/public.pem)
npm run setup

# 2. Boot Postgres 15 + pgvector; seed.sql applies automatically on first boot
docker compose up -d db

# 3. Install dependencies for all three services
npm run install:all

# 4. Run all three services in one terminal
npm run dev              # backend :4000, companion :3001, host :3000
```

`npm run dev` needs a POSIX shell (Linux, macOS, Git Bash). To run the
services separately instead: `npm run dev:backend`, `npm run dev:companion`,
`npm run dev:host`.

Then open **http://localhost:3000**, click **Log in as Policyholder** or
**Log in as Beneficiary**, and watch the embedded companion receive the token
and report backend verification.

Sanity checks:

```bash
curl http://localhost:4000/health
curl http://localhost:3000/.well-known/jwks.json
docker exec -it companion-db psql -U companion -d companion -c "SELECT id, role, deceased_flag FROM profiles;"
```

Booted an earlier version of the shell? The schema has changed since, and the
seed only runs on a fresh database. Drop the old volume and re-seed:

```bash
docker compose down -v && docker compose up -d db
```

### Everything in Docker (optional, no local Node needed)

```bash
docker compose --profile full up
```

One command: it generates the keypair, seeds the database, and starts all
three services. First start is slow (each container runs `npm install`). The
plain-npm dev loop above is the recommended path for iterating.

## Fallback: no Docker (local Postgres)

```bash
# 1. Create the database and enable pgvector, then apply the schema + seeds
createdb companion
psql -d companion -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql -d companion -f db/seed.sql

# 2. The defaults in .env.example match this setup. Note: only docker compose
#    reads the root .env; the npm services read real environment variables,
#    so if your credentials differ, export them (e.g. DATABASE_URL) instead.

# 3. Same as above
npm run setup
npm run install:all
npm run dev
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
├── scripts/generate-keys.mjs   # setup: mock RS256 keypair -> keys/ (git-ignored)
├── host/                       # Zone 1: mock portal, signs the token at /api/token
├── companion/                  # Zone 2: embedded child app, listens for the token
└── companion-backend/          # Zone 3: verify route + stub routes
```

Every stub route has a short comment saying what it's for, so you can follow
the repo without needing to open `SUBMISSION.md`.
