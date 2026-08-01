# infra

Deployment for the companion stack. It reuses an existing Ubuntu VM on Oracle
Cloud rather than standing up its own, so there is nothing to provision here
beyond DNS.

| Path | What it is |
|------|------------|
| `terraform/` | Three proxied Cloudflare A records, one per trust zone. |
| `deploy/` | The runtime stack for `/opt/lumina`: Caddy, the two Next apps, the backend and pgvector. |

## Hostnames

| Zone | Hostname | Container |
|---|---|---|
| Host portal | `lumina.<domain>` | `host:3000` |
| Embedded companion | `companion.<domain>` | `companion:3001` |
| Companion backend | `api-lumina.<domain>` | `backend:4000` |

Host and companion stay on separate origins deliberately: the `postMessage`
origin allowlisting between them is the trust boundary, and a shared origin
would make it decorative.

Caddy serves a Cloudflare origin certificate already installed on the VM (a
wildcard covering the zone), so there is no ACME step.

## DNS

```bash
cd terraform
terraform init
TF_VAR_cloudflare_api_token=... terraform apply
```

## Runtime

The VM also hosts an unrelated stack that wants ports 80 and 443, so only one
can run at a time:

```bash
docker compose -f /opt/<other-stack>/docker-compose.yml down   # release 80/443
cd /opt/lumina/infra/deploy && docker compose up -d
```

Reverse the two commands to hand the box back.

## Rebuilding after a config change

`NEXT_PUBLIC_*` values are inlined into the Next bundles during `docker build`.
Changing an origin in `.env` therefore requires a rebuild, not a restart:

```bash
docker compose up -d --build host companion
```

Ordinary backend settings (gateway credentials, similarity floor, translation
provider) are read at run time and only need `docker compose up -d backend`.

## What is not deployed

The Python service in `rag/` is not part of this stack. The Node backend does
its own retrieval by SQL against the same tables, so the service is only needed
for corpus ingestion, which is done once and loaded from a dump.
