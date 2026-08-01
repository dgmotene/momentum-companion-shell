// The backend the companion frontend talks to. It verifies the identity JWT
// against the public key the host publishes at /.well-known/jwks.json, enforces
// the role capability matrix, and is the only place holding Momentum AI Gateway
// credentials.

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
import {
  processChatMessage,
  understandMessage,
  loadPolicySnapshot,
  getOrCreateSession,
  updateSession,
} from "./chat.js";
import { estimatePremium } from "./domain/whatif.mjs";
import { claimChecklist } from "./domain/claims-content.mjs";
import {
  ADDRESS_FIELDS,
  validateAddress,
  currentAddress,
  applyAddressUpdate,
} from "./domain/address-update.mjs";

const FIELD_LABELS = {
  street: "street address",
  suburb: "suburb",
  city: "city",
  province: "province",
  postal_code: "4-digit postal code",
};

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
// Checks the token's signature, issuer, audience and expiry. Every protected
// route runs this same check server-side and never trusts the frontend.
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

const answeredText = (text) => ({
  session_id: "",
  outcome: "answered",
  blocks: [{ kind: "text", text }],
  citations: [],
});

function refusedResponse(identity, action, text) {
  writeAudit({
    profileId: identity.sub,
    policyId: identity.policyId,
    role: identity.role,
    action,
    authResult: "denied",
    reason: `role ${identity.role} may not ${action}`,
  });
  return {
    session_id: "",
    outcome: "refused",
    blocks: [{ kind: "text", text }],
    citations: [],
    refusal_reason: text,
  };
}

async function whatIfResponse(identity, understanding) {
  if (!capabilitiesFor(identity).whatIf) {
    return refusedResponse(
      identity,
      "whatIf",
      "Premium estimates aren't available on your profile. I can help with questions about the policy and with a claim."
    );
  }
  const params = {
    requestedSum: understanding.requestedSum,
    waitingMonths: understanding.waitingMonths ?? 0,
  };
  if (!params.requestedSum) {
    return answeredText(
      "Tell me the cover amount to estimate, and optionally a waiting period of 0, 3, 6, 12 or 24 months. For example: what would I pay for R400 000 cover with a 6 month wait?"
    );
  }
  const policy = await loadPolicySnapshot(identity.policyId);
  if (!policy) return answeredText("I couldn't find a policy on your profile to estimate against.");
  const estimate = estimatePremium({
    currentPremium: Number(policy.monthly_premium),
    currentSum: Number(policy.sum_assured),
    requestedSum: params.requestedSum,
    waitingMonths: params.waitingMonths,
  });
  if (estimate.error) return answeredText(`I couldn't run that estimate: ${estimate.error}.`);
  writeAudit({
    profileId: identity.sub,
    policyId: identity.policyId,
    role: identity.role,
    action: "whatif_estimate",
    authResult: "allowed",
    validationResult: "passed",
  });
  const conditions = [`${params.waitingMonths} month waiting period`];
  if (estimate.flooredAtMinimum) conditions.push("Minimum premium of R200 applies");
  return {
    session_id: "",
    outcome: "answered",
    blocks: [
      {
        kind: "text",
        text: `For R${params.requestedSum.toLocaleString("en-ZA")} of cover with a ${params.waitingMonths} month waiting period, you would pay about R${estimate.estimatedPremium} a month instead of your current R${Number(policy.monthly_premium)}. A shorter wait costs more.`,
      },
      {
        kind: "value",
        label: "Estimated monthly premium",
        amount: `R${estimate.estimatedPremium}`,
        classification: "illustrative",
        conditions,
        compareTo: { label: "Current premium", amount: `R${Number(policy.monthly_premium)}` },
      },
      { kind: "text", text: estimate.disclaimer },
    ],
    citations: [],
  };
}

async function claimResponse(identity, understanding) {
  if (!capabilitiesFor(identity).claimsSupport) {
    return refusedResponse(
      identity,
      "claimsSupport",
      "I can't open a claim on this profile yet. If you believe this is in error, I can connect you with a person."
    );
  }
  const claimType = understanding.claimType ?? "death";
  const checklist = claimChecklist(claimType, { deceasedFlag: identity.deceasedFlag });
  writeAudit({
    profileId: identity.sub,
    policyId: identity.policyId,
    role: identity.role,
    action: `claims_guidance:${claimType}`,
    authResult: "allowed",
  });
  // The hardest moment is never improvised: fixed, human-written text.
  const opening =
    claimType === "death" && identity.deceasedFlag
      ? "I'm so sorry for your loss. There's no rush here; we can go at your pace, and you can pause and come back at any time. The death certificate is already on file, so you will never be asked for it."
      : `Here is what a ${checklist.label.toLowerCase()} needs.`;
  return {
    session_id: "",
    outcome: "answered",
    blocks: [
      { kind: "text", text: opening },
      {
        kind: "checklist",
        title: checklist.label,
        items: checklist.documents.map((document, index) => ({
          id: `doc-${index}`,
          label: document.name,
          state: document.onFile ? "on_file" : "outstanding",
        })),
      },
      { kind: "sla", text: checklist.timeline },
      { kind: "suggestions", chips: ["What happens after I send everything?", "How long does assessment take?"] },
    ],
    citations: [],
  };
}

// Conversational address update: collect fields across turns in
// workflow_state, read back, apply only after an explicit confirm.
// Which matrix capability governs each update target. The matrix value
// decides the path: true = self-service, "human_review" = escalate, false = refuse.
const UPDATE_CAPABILITY = {
  address: "selfServiceUpdate",
  banking: "bankingChange",
  beneficiary: "beneficiaryChange",
};

function escalatedResponse(identity, target) {
  writeAudit({
    profileId: identity.sub,
    policyId: identity.policyId,
    role: identity.role,
    action: `${target}_change_requested`,
    authResult: "allowed",
    validationResult: "pending human review",
    handoffFlag: true,
    reason: `${target} changes always require human review`,
  });
  return {
    session_id: "",
    outcome: "escalated",
    blocks: [
      {
        kind: "text",
        text: `${target.charAt(0).toUpperCase() + target.slice(1)} changes are always confirmed by a person, for your protection. I've logged your request; a consultant will contact you to verify the change before anything is updated.`,
      },
      { kind: "escalation", reason: `${target} change requires human verification` },
    ],
    citations: [],
  };
}

async function addressResponse(identity, understanding) {
  const target = understanding.updateTarget ?? "address";
  const capability = capabilitiesFor(identity)[UPDATE_CAPABILITY[target]];
  if (capability === "human_review") return escalatedResponse(identity, target);
  if (!capability) {
    return refusedResponse(
      identity,
      UPDATE_CAPABILITY[target],
      "Updates aren't available on your profile. I can help with questions about the policy and with a claim."
    );
  }
  const session = await getOrCreateSession(identity.sub, identity.role);
  const state = session.workflow_state ?? {};
  const collected = { ...(state.journey === "address_update" ? state.collected : {}) };
  for (const field of ADDRESS_FIELDS) {
    const value = understanding.address?.[field];
    if (value && String(value).trim()) collected[field] = String(value).trim();
  }
  const missing = ADDRESS_FIELDS.filter((field) => !collected[field]);
  if (missing.length) {
    await updateSession(session.id, session.history, {
      journey: "address_update",
      collected,
      missing,
    });
    return answeredText(
      Object.keys(collected).length
        ? `Almost there. I still need your ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.`
        : "I can update your address right here. Tell me your new street address, suburb, city, province and 4-digit postal code, in any order."
    );
  }
  const validationError = validateAddress(collected);
  if (validationError) {
    await updateSession(session.id, session.history, {
      journey: "address_update",
      collected,
      missing: [],
    });
    return answeredText(`One thing to fix before I can proceed: ${validationError}.`);
  }
  await updateSession(session.id, session.history, {
    journey: "address_update",
    collected,
    missing: [],
    pending_confirmation: true,
  });
  writeAudit({
    profileId: identity.sub,
    policyId: identity.policyId,
    role: identity.role,
    action: "address_update_propose",
    authResult: "allowed",
    validationResult: "passed",
  });
  const existing = await currentAddress(identity.sub);
  return {
    session_id: session.id,
    outcome: "answered",
    blocks: [
      { kind: "text", text: "Please check the details below, then reply confirm to apply the change." },
      {
        kind: "diff",
        rows: ADDRESS_FIELDS.map((field) => ({
          label: FIELD_LABELS[field],
          from: existing?.[field] ?? "(not on file)",
          to: collected[field],
        })),
      },
    ],
    citations: [],
  };
}

async function confirmResponse(identity) {
  const session = await getOrCreateSession(identity.sub, identity.role);
  const state = session.workflow_state ?? {};
  if (state.journey === "address_update" && state.pending_confirmation) {
    if (!capabilitiesFor(identity).selfServiceUpdate) {
      return refusedResponse(identity, "selfServiceUpdate", "Updates aren't available on your profile.");
    }
    const validationError = validateAddress(state.collected);
    if (validationError) return answeredText(`Something changed since the readback: ${validationError}.`);
    const { provinceChanged } = await applyAddressUpdate(identity, state.collected);
    await updateSession(session.id, session.history, {});
    return {
      session_id: session.id,
      outcome: "applied",
      blocks: [
        {
          kind: "text",
          text:
            "Done. Your address has been updated." +
            (provinceChanged ? " Your province changed, so that has been noted on your record." : ""),
        },
        {
          kind: "checks",
          items: ADDRESS_FIELDS.map((field) => ({
            label: `${FIELD_LABELS[field]}: ${state.collected[field]}`,
            ok: true,
          })),
        },
      ],
      citations: [],
    };
  }
  return answeredText("There's nothing waiting for your confirmation right now. What can I help with?");
}

// POST /api/chat - grounded chat, always in the shared ChatResponse shape.
app.post("/api/chat", requireAuth, async (req, res) => {
  const userMessage = String(req.body?.message ?? "").trim();
  if (!userMessage) return res.status(400).json({ error: "message required" });

  const startedAt = Date.now();
  const understanding = await understandMessage(userMessage).catch(() => ({
    intent: "policy_question",
    claimType: null,
    requestedSum: null,
    waitingMonths: null,
    address: {},
  }));
  const intent = understanding.intent;
  const send = (payload) => {
    console.log(
      `[chat] ${req.identity.sub} (${req.identity.role}) intent=${intent} outcome=${payload.outcome} ${Date.now() - startedAt}ms`
    );
    return res.json(payload);
  };

  if (intent === "greeting") {
    return send(
      answeredText(
        `Hello ${req.identity.fullName.split(" ")[0]}. I can answer questions about your policy, estimate premium changes, update your address, or guide you through a claim. What can I help with?`
      )
    );
  }
  if (intent === "thanks") {
    return send(answeredText("You're welcome. I'm here whenever you need anything on your policy."));
  }
  if (intent === "quote_request") return send(await whatIfResponse(req.identity, understanding));
  if (intent === "claim") return send(await claimResponse(req.identity, understanding));
  if (intent === "update_request") return send(await addressResponse(req.identity, understanding));
  if (intent === "confirm") return send(await confirmResponse(req.identity));

  if (!capabilitiesFor(req.identity).policyQA) {
    const refusal =
      req.identity.role === "beneficiary" && !req.identity.deceasedFlag
        ? "I can't share policy information with you yet. Access opens once Momentum has verified the policyholder's passing. If you believe this is in error, I can connect you with a person."
        : "That isn't available on your profile.";
    return send(refusedResponse(req.identity, "policyQA", refusal));
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
      return send({
        session_id: result.sessionId,
        outcome: "no_grounding",
        blocks: [{ kind: "text", text: NO_GROUNDING_RESPONSE }],
        citations: [],
      });
    }

    return send({
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
    return send({
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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`companion-backend listening on http://localhost:${PORT}`);
  console.log(`  Verify: POST /api/verify (JWKS from ${HOST_ORIGIN}/.well-known/jwks.json)`);
});
