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
import {
  verifyIdentityToken,
  isKeyFetchError,
  HOST_ORIGIN,
} from "./auth/verify.mjs";
import domainRoutes from "./domain/routes.mjs";
import { requireAuth } from "./auth/middleware.mjs";
import { capabilitiesFor } from "./domain/capabilities.mjs";
import { writeAudit } from "./domain/audit.mjs";
import { processChatMessage, classifyIntent } from "./chat.js";

// Word-for-word from shared/contract.ts NO_GROUNDING_RESPONSE.
const NO_GROUNDING_RESPONSE =
  "I can't confirm that from the provided documents. I can explain what is available or refer this for human review.";

const PORT = Number(process.env.COMPANION_BACKEND_PORT ?? 4000);
const ALLOWED_ORIGIN =
  process.env.COMPANION_ALLOWED_ORIGIN ?? "http://localhost:3001";

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
    const payload = await verifyIdentityToken(token);
    return res.json({ verified: true, claims: payload });
  } catch (err) {
    if (isKeyFetchError(err)) {
      return res.status(503).json({
        verified: false,
        error: `could not fetch the signing key from ${HOST_ORIGIN}/.well-known/jwks.json; is the host running?`,
      });
    }
    return res.status(401).json({ verified: false, error: err.code });
  }
});

// Role-scoped policy servicing: /api/me, /api/policy, /api/whatif,
// /api/claims/guidance, address update, banking escalation.
app.use(domainRoutes);

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

// POST /api/chat - grounded chat, always in the shared ChatResponse shape.
app.post("/api/chat", requireAuth, async (req, res) => {
  const userMessage = String(req.body?.message ?? "").trim();
  if (!userMessage) return res.status(400).json({ error: "message required" });

  const intent = await classifyIntent(userMessage).catch(() => "policy_question");

  const FIXED_REPLIES = {
    greeting: `Hello ${req.identity.fullName.split(" ")[0]}. I can answer questions about your policy, estimate premium changes, help update your details, or guide you through a claim. What can I help with?`,
    quote_request:
      "I can help with premium estimates. The What-If tool on your dashboard lets you try cover amounts and waiting periods and see the estimated premium side by side. Estimates are illustrative; a consultant confirms the final premium before any change.",
    update_request:
      "I can help with that. Address updates are available from your dashboard under your details, where you confirm the change before anything is applied. Banking and beneficiary changes are always verified by a consultant for your protection. Would you like me to arrange a callback?",
  };
  if (FIXED_REPLIES[intent]) {
    return res.json({
      session_id: "",
      outcome: "answered",
      blocks: [{ kind: "text", text: FIXED_REPLIES[intent] }],
      citations: [],
    });
  }

  if (!capabilitiesFor(req.identity).policyQA) {
    const refusal =
      req.identity.role === "beneficiary" && !req.identity.deceasedFlag
        ? "I can't share policy information with you yet. Access opens once Momentum has verified the policyholder's passing. If you believe this is in error, I can connect you with a person."
        : "That isn't available on your profile.";
    writeAudit({
      profileId: req.identity.sub,
      policyId: req.identity.policyId,
      role: req.identity.role,
      action: "CHAT_QUERY",
      authResult: "denied",
      reason: `role ${req.identity.role} may not policyQA`,
    });
    return res.json({
      session_id: "",
      outcome: "refused",
      blocks: [{ kind: "text", text: refusal }],
      citations: [],
      refusal_reason: refusal,
    });
  }

  try {
    const result = await processChatMessage({
      userProfile: {
        id: req.identity.sub,
        full_name: req.identity.fullName,
        role: req.identity.role,
        policy_id: req.identity.policyId,
      },
      userPrompt: userMessage,
    });

    if (!result.grounded) {
      return res.json({
        session_id: result.sessionId,
        outcome: "no_grounding",
        blocks: [{ kind: "text", text: NO_GROUNDING_RESPONSE }],
        citations: [],
      });
    }

    return res.json({
      session_id: result.sessionId,
      outcome: "answered",
      blocks: [{ kind: "text", text: result.text }],
      citations: result.chunks.map((chunk) => ({
        section: `${chunk.part ?? "Myriad guide"} / ${chunk.section ?? "General"}`,
        source: `Myriad technical guide p.${chunk.printed_page}`,
      })),
    });
  } catch (err) {
    console.error("chat pipeline failed", err);
    return res.json({
      session_id: "",
      outcome: "error",
      blocks: [
        {
          kind: "text",
          text: "Something went wrong on our side. Please try again, or ask me to connect you with a person.",
        },
      ],
      citations: [],
    });
  }
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
