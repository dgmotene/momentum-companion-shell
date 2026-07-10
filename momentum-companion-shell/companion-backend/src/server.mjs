// This is the backend that the companion frontend talks to.
// We used plain Express instead of Fastify since this skeleton only has one
// real route (verify) and Express is simpler to read.
//
// What this service does:
//   - serves a mock JWKS endpoint (the public key, in JWT format)
//   - verifies the identity JWT (signature, issuer, audience, expiry)
//   - will be the only place that holds the Momentum AI Gateway credentials
//   - everything else below is just a stub for now, no real AI logic yet

import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importSPKI, exportJWK, createLocalJWKSet, jwtVerify } from "jose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.COMPANION_BACKEND_PORT ?? 4000);
const ISSUER = process.env.JWT_ISSUER ?? "https://mock-host.local";
const AUDIENCE = process.env.JWT_AUDIENCE ?? "companion-backend";
const PUBLIC_KEY_PATH =
  process.env.JWT_PUBLIC_KEY_PATH ??
  path.join(__dirname, "..", "..", "keys", "public.pem");
const ALLOWED_ORIGIN =
  process.env.COMPANION_ALLOWED_ORIGIN ?? "http://localhost:3001";
const KID = "mock-key-1";

// Build the mock JWKS once when the server starts, from the generated public key.
let jwks;
try {
  const pem = readFileSync(PUBLIC_KEY_PATH, "utf8");
  const key = await importSPKI(pem, "RS256");
  const jwk = await exportJWK(key);
  jwks = { keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] };
} catch {
  console.error(
    `Public key not found at ${PUBLIC_KEY_PATH}. Run \`npm run setup\` at the repo root first.`
  );
  process.exit(1);
}
const localJWKS = createLocalJWKSet(jwks);

const app = express();
app.use(express.json());

// Basic CORS, only allowing the companion frontend's origin (no extra package needed).
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// GET /.well-known/jwks.json
// Publishes our public key so tokens can be verified against it, instead of
// just hardcoding a check somewhere. This is how real OIDC providers do it too.
app.get("/.well-known/jwks.json", (_req, res) => {
  res.json(jwks);
});

// POST /api/verify
// The only real security logic in this skeleton right now. Checks the token's
// signature, issuer, audience, and expiry. Every protected route we add later
// should run this same check on the server, never just trust the frontend.
app.post("/api/verify", async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).json({ error: "token required" });
  try {
    const { payload } = await jwtVerify(token, localJWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    });
    // TODO: if the linked policyholder is deceased, downgrade this user to
    // the restricted Beneficiary role here on the backend, not in the UI.
    return res.json({ verified: true, claims: payload });
  } catch (err) {
    return res.status(401).json({ verified: false, error: err.code ?? "invalid token" });
  }
});

// POST /api/gateway-ping (stub)
// TODO: this route will eventually call the real AI gateway. Steps:
//   1. Get an OAuth2 token using GATEWAY_OAUTH_CLIENT_ID / _SECRET (these
//      stay backend-only, never sent to the browser).
//   2. Call the gateway's chat endpoint with that token.
// For now it just returns a fake response to prove the route works.
app.post("/api/gateway-ping", (_req, res) => {
  res.json({
    stub: true,
    message:
      "Gateway client not implemented in the Environment Shell. OAuth2 client-credentials will be read from env vars here, backend-only.",
  });
});

// POST /api/chat (stub)
// TODO: this will figure out what the user wants and route to the right
// logic. Since the gateway itself doesn't remember conversations, our
// backend has to store the chat history.
app.post("/api/chat", (_req, res) => {
  res.json({ stub: true, message: "Orchestrator not implemented (design round)." });
});

// POST /api/whatif (stub)
// TODO: calculates an estimated new premium if the user changes their cover.
// Formula: new = max(200, current * (requested / current_sum) * factor)
app.post("/api/whatif", (_req, res) => {
  res.json({ stub: true, message: "What-If calculation not implemented (design round)." });
});

// POST /api/rag/query (stub)
// TODO: will search the documents table in Postgres (pgvector) for the most
// relevant policy text, using embeddings created by the gateway.
app.post("/api/rag/query", (_req, res) => {
  res.json({ stub: true, message: "RAG retrieval not implemented (design round)." });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`companion-backend listening on http://localhost:${PORT}`);
  console.log(`  JWKS:   GET  /.well-known/jwks.json`);
  console.log(`  Verify: POST /api/verify`);
});
