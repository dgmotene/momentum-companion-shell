// This is the backend that the companion frontend talks to.
// We used plain Express instead of Fastify since this skeleton only has one
// real route (verify) and Express is simpler to read.
//
// What this service does:
//   - verifies the identity JWT (signature, issuer, audience, expiry)
//     against the public key the host publishes at /.well-known/jwks.json
//   - will be the only place that holds the Momentum AI Gateway credentials
//   - everything else below is just a stub for now, no real AI logic yet

import express from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const PORT = Number(process.env.COMPANION_BACKEND_PORT ?? 4000);
const ISSUER = process.env.JWT_ISSUER ?? "https://mock-host.local";
const AUDIENCE = process.env.JWT_AUDIENCE ?? "companion-backend";
const HOST_ORIGIN = process.env.HOST_ORIGIN ?? "http://localhost:3000";
const ALLOWED_ORIGIN =
  process.env.COMPANION_ALLOWED_ORIGIN ?? "http://localhost:3001";

// Fetch the host's public key from its JWKS endpoint (cached by jose).
// The backend can verify tokens but never holds a key that could sign one.
const hostJWKS = createRemoteJWKSet(
  new URL(`${HOST_ORIGIN}/.well-known/jwks.json`)
);

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

// POST /api/verify
// The only real security logic in this skeleton right now. Checks the token's
// signature, issuer, audience, and expiry. Every protected route we add later
// should run this same check on the server, never just trust the frontend.
app.post("/api/verify", async (req, res) => {
  const token = req.body?.token;
  if (!token) return res.status(400).json({ error: "token required" });
  try {
    const { payload } = await jwtVerify(token, hostJWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    });
    // TODO: apply the role + deceased_flag rules here on the backend, not in
    // the UI: beneficiary + flag true = Q&A and claims only; flag false = no
    // access to the policy yet. When cross-checking against the profiles
    // table, resolve the flag via linked_to (the beneficiary's claim mirrors
    // the linked policyholder's row, not their own).
    return res.json({ verified: true, claims: payload });
  } catch (err) {
    // No jose error code (or a JWKS timeout) means the key fetch itself
    // failed: a setup problem, not a bad token.
    if (!err.code || err.code === "ERR_JWKS_TIMEOUT") {
      return res.status(503).json({
        verified: false,
        error: `could not fetch the signing key from ${HOST_ORIGIN}/.well-known/jwks.json; is the host running?`,
      });
    }
    return res.status(401).json({ verified: false, error: err.code });
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
  console.log(`  Verify: POST /api/verify (JWKS from ${HOST_ORIGIN}/.well-known/jwks.json)`);
});
