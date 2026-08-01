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
import { resolveSubject, isStaffRole } from "./domain/subject.mjs";
import { guardCompletion } from "./domain/output-guard.mjs";
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
import { capabilitySummary } from "./domain/capability-summary.mjs";
import { loadUserContext, describeUserRecord } from "./domain/user-context.mjs";
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

// Word-for-word from shared/contract.ts VALUE_CLASS_NOTE.potentially_payable.
const POTENTIALLY_PAYABLE_NOTE =
  "This is what may be payable if the requirements are met. It is not a confirmed amount, and it is not a decision on any claim.";

const COMPLIANCE_BLOCKED_RESPONSE =
  "I can't give you a reliable answer on that one. Rather than risk telling you something about your outcome that isn't certain, I'd like to put you through to a consultant.";

const MAX_MESSAGE_LENGTH = 2000;

// "yes", "confirm", "that's correct" all fit; a sentence does not.
const BARE_CONFIRMATION_MAX = 25;

// Subject matter only. "What can you do" and "what should I ask" name none of
// it and stay questions about the assistant.
const ABOUT_THE_PRODUCT =
  /\b(polic(y|ies)|product|benefit|cover|premium|claim|exclusion|waiting period|beneficiar|underwrit|myriad)\w*\b/i;

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

// These builders omit session_id on purpose: the /api/chat send() helper stamps
// the resolved session onto every response, so no handler can forget it.
const answeredText = (text) => ({
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
    outcome: "refused",
    blocks: [{ kind: "text", text }],
    citations: [],
    refusal_reason: text,
  };
}

// "What can you do?" is a question about the assistant, not about the policy,
// so it is answered from the capability matrix rather than the guide.
function capabilitiesResponse(identity) {
  return answeredText(
    capabilitySummary(identity) ??
      "There isn't any policy information available to you at the moment, so there is little I can help with here. I can connect you with a person if you think that is wrong."
  );
}

// Staff hold no policy of their own, so a policy question with no client
// chosen has no subject to answer about.
function chooseClientResponse() {
  return answeredText(
    "Choose a client in the portal first and I'll answer about their policy. I can still answer general questions from the Myriad guide without one."
  );
}

const QUOTE_JOURNEY = "whatif_quote";

// A cover amount below this is not a cover amount, so an unrelated small number
// cannot be mistaken for the answer to a pending quote question.
const PLAUSIBLE_COVER_FLOOR = 1000;

// Someone's own record is answered from the database, not the guide: retrieval
// would find nothing and the no-grounding rule would hide data we already hold.
async function myDetailsResponse(identity, understanding, subject) {
  if (!capabilitiesFor(identity).policyQA) {
    return refusedResponse(
      identity,
      "policyQA",
      "I can't share policy information with you yet. Access opens once Momentum has verified the policyholder's passing. If you believe this is in error, I can connect you with a person."
    );
  }
  if (subject.kind === "none") return chooseClientResponse();
  const delegated = subject.kind === "delegated";
  const userContext = await loadUserContext({
    profileId: subject.profileId,
    policyId: subject.policyId,
    role: identity.role,
  });
  const detailsTarget = understanding?.detailsTarget ?? null;
  const { facts, amounts } = describeUserRecord(userContext, detailsTarget);
  if (!facts.length && !amounts.length) {
    const whose = delegated ? "that client's" : "your";
    return answeredText(
      detailsTarget
        ? `I don't have that on ${whose} record. If you expected to see it, I can connect you with a person.`
        : `There is nothing on file against ${whose} profile yet. If you expected to see a policy here, I can connect you with a person.`
    );
  }
  writeAudit({
    profileId: identity.sub,
    policyId: subject.policyId,
    role: identity.role,
    action: delegated ? "view_client_record" : "view_own_record",
    authResult: "allowed",
    reason: delegated ? `acting for ${subject.policyId}` : null,
  });
  const opening = delegated
    ? `Here is what Momentum has on file for ${userContext.profile.full_name}.`
    : "Here is what Momentum has on file for you.";
  return {
    outcome: "answered",
    blocks: [
      { kind: "text", text: opening },
      { kind: "list", items: facts },
      ...amounts.map((entry) => ({
        kind: "value",
        label: entry.label,
        amount: entry.amount,
        classification: "recorded",
      })),
    ],
    citations: [],
  };
}

async function whatIfResponse(identity, understanding, session, subject) {
  if (!capabilitiesFor(identity).whatIf) {
    return refusedResponse(
      identity,
      "whatIf",
      "Premium estimates aren't available on your profile. I can help with questions about the policy and with a claim."
    );
  }
  if (subject.kind === "none") return chooseClientResponse();
  const params = {
    requestedSum: understanding.requestedSum,
    waitingMonths: understanding.waitingMonths ?? null,
  };
  if (!params.requestedSum) {
    // Remember that we asked, so a bare amount on the next turn is read as the
    // answer to this question rather than as a new topic.
    await updateSession(session.id, session.history, { journey: QUOTE_JOURNEY });
    return answeredText(
      "Tell me the cover amount to estimate, and optionally a waiting period of 3, 6, 12 or 24 months. For example: what would I pay for R400 000 cover with a 6 month wait?"
    );
  }
  if ((session.workflow_state ?? {}).journey === QUOTE_JOURNEY) {
    await updateSession(session.id, session.history, {});
  }
  const policy = await loadPolicySnapshot(subject.policyId);
  if (!policy) {
    return answeredText(
      subject.kind === "delegated"
        ? "I couldn't find that client's policy to estimate against."
        : "I couldn't find a policy on your profile to estimate against."
    );
  }
  const estimate = estimatePremium({
    currentPremium: Number(policy.monthly_premium),
    currentSum: Number(policy.sum_assured),
    requestedSum: params.requestedSum,
    waitingMonths: params.waitingMonths,
  });
  if (estimate.error) return answeredText(`I couldn't run that estimate: ${estimate.error}.`);
  writeAudit({
    profileId: identity.sub,
    policyId: subject.policyId,
    role: identity.role,
    action: "whatif_estimate",
    authResult: "allowed",
    validationResult: "passed",
    reason: subject.kind === "delegated" ? `acting for ${subject.policyId}` : null,
  });
  // The guide lists seven waiting periods and none is zero, so never invent one.
  const wait = estimate.waitingMonths === null ? "" : ` with a ${estimate.waitingMonths} month waiting period`;
  const conditions = wait ? [`${estimate.waitingMonths} month waiting period`] : [];
  if (estimate.flooredAtMinimum) conditions.push("Minimum premium of R200 applies");
  return {
    outcome: "answered",
    blocks: [
      {
        kind: "text",
        text:
          subject.kind === "delegated"
            ? `For R${params.requestedSum.toLocaleString("en-ZA")} of cover${wait}, they would pay about R${estimate.estimatedPremium} a month instead of their current R${Number(policy.monthly_premium)}.`
            : `For R${params.requestedSum.toLocaleString("en-ZA")} of cover${wait}, you would pay about R${estimate.estimatedPremium} a month instead of your current R${Number(policy.monthly_premium)}.`,
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

async function claimResponse(identity, understanding, subject, session) {
  if (!capabilitiesFor(identity).claimsSupport) {
    return refusedResponse(
      identity,
      "claimsSupport",
      "I can't open a claim on this profile yet. If you believe this is in error, I can connect you with a person."
    );
  }
  const claimType = understanding.claimType ?? "death";
  const checklist = claimChecklist(claimType, { deceasedFlag: subject.deceasedFlag });
  const checklistItems = checklist.documents.map((document, index) => ({
    id: `doc-${index}`,
    label: document.name,
    state: document.onFile ? "on_file" : "outstanding",
  }));
  writeAudit({
    profileId: identity.sub,
    policyId: subject.policyId,
    role: identity.role,
    action: `claims_guidance:${claimType}`,
    authResult: "allowed",
    reason: subject.kind === "delegated" ? `acting for ${subject.policyId}` : null,
  });
  // The hardest moment is never improvised: fixed, human-written text. Only
  // for the bereaved themselves; staff working the same claim get the brief.
  const opening =
    claimType === "death" && subject.deceasedFlag && subject.kind !== "delegated"
      ? "I'm so sorry for your loss. There's no rush here; we can go at your pace, and you can pause and come back at any time. The death certificate is already on file, so you will never be asked for it."
      : `Here is what a ${checklist.label.toLowerCase()} needs.`;
  // Pins "Where things stand" above the composer. The same items the message
  // carries, so the card and the message can never disagree.
  const workflow = {
    journey: "claim",
    claim_type: claimType,
    collected: {},
    missing: checklist.documents.filter((document) => !document.onFile).map((document) => document.name),
    checklist: checklistItems,
  };
  // Held in the session, not in the model, so the claim is still there after a
  // reload or a night's sleep.
  await updateSession(session.id, session.history, workflow);

  return {
    outcome: "answered",
    blocks: [
      { kind: "text", text: opening },
      { kind: "checklist", title: checklist.label, items: checklistItems },
      { kind: "sla", text: checklist.timeline },
    ],
    citations: [],
    workflow,
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

function escalatedResponse(identity, target, subject) {
  writeAudit({
    profileId: identity.sub,
    policyId: subject?.policyId ?? identity.policyId,
    role: identity.role,
    action: `${target}_change_requested`,
    authResult: "allowed",
    validationResult: "pending human review",
    handoffFlag: true,
    reason: `${target} changes always require human review`,
  });
  return {
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

async function addressResponse(identity, understanding, subject) {
  const target = understanding.updateTarget ?? "address";
  const capability = capabilitiesFor(identity)[UPDATE_CAPABILITY[target]];
  if (capability === "human_review") return escalatedResponse(identity, target, subject);
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
  // Nothing pending. The caller decides what to do with that, because a bare
  // "yes" and a question that merely opens with "so I will..." deserve
  // different answers.
  return null;
}

// POST /api/chat - grounded chat, always in the shared ChatResponse shape.
app.post("/api/chat", requireAuth, async (req, res) => {
  const userMessage = String(req.body?.message ?? "").trim();
  if (!userMessage) return res.status(400).json({ error: "message required" });
  // Long enough for any real question, short enough that nobody can bill us
  // for a novel.
  if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return res.status(413).json({
      error: "message too long",
      message: `That is longer than I can take in one go. Could you shorten it to under ${MAX_MESSAGE_LENGTH} characters?`,
    });
  }

  // A caller who holds nothing at all is refused before the classifier runs,
  // so being refused costs no gateway call.
  const held = capabilitiesFor(req.identity);
  if (!Object.values(held).some(Boolean)) {
    return res.status(403).json(
      refusedResponse(
        req.identity,
        "policyQA",
        "I can't share policy information with you yet. Access opens once Momentum has verified the policyholder's passing. If you believe this is in error, I can connect you with a person."
      )
    );
  }

  const startedAt = Date.now();
  const session = await getOrCreateSession(req.identity.sub, req.identity.role);

  // Before the model, so a request for a policy this caller may not touch
  // costs a database round trip rather than a gateway call.
  const subject = await resolveSubject(req.identity, req.body?.acting_for);
  if (subject.kind === "denied") {
    writeAudit({
      profileId: req.identity.sub,
      policyId: String(req.body?.acting_for ?? "").slice(0, 64) || null,
      role: req.identity.role,
      action: "act_on_behalf",
      authResult: "denied",
      reason: subject.reason,
      sessionId: session.id,
    });
    return res.status(403).json({
      session_id: session.id,
      outcome: "refused",
      blocks: [
        {
          kind: "text",
          text: "That policy isn't one you're authorised to act on. If you believe this is wrong, your manager can have it added to your book.",
        },
      ],
      citations: [],
      refusal_reason: subject.reason,
    });
  }

  const understanding = await understandMessage(userMessage).catch(() => ({
    intent: "policy_question",
    claimType: null,
    requestedSum: null,
    waitingMonths: null,
    address: {},
  }));
  // The classifier only ever sees the current message, so it labels "maybe
  // R700000" as unrelated even though it extracts the amount correctly. If we
  // are the ones who just asked for a cover amount, that answer is the quote.
  const awaitingCoverAmount = (session.workflow_state ?? {}).journey === QUOTE_JOURNEY;
  const classified =
    awaitingCoverAmount &&
    understanding.intent !== "quote_request" &&
    understanding.requestedSum >= PLAUSIBLE_COVER_FLOOR
      ? "quote_request"
      : understanding.intent;
  // "Explain the product benefits" classifies as a question about the
  // assistant and gets answered with a description of the assistant. Naming
  // the subject matter settles it: this is a question about the product.
  const intent =
    classified === "capabilities" && ABOUT_THE_PRODUCT.test(userMessage)
      ? "policy_question"
      : classified;
  // A claim already in progress stays pinned through unrelated questions and
  // across a reload, so nobody has to remember where they left off.
  const pinnedClaim =
    (session.workflow_state ?? {}).journey === "claim" ? session.workflow_state : null;

  const send = (payload) => {
    console.log(
      `[chat] ${req.identity.sub} (${req.identity.role}) intent=${intent} outcome=${payload.outcome} ${Date.now() - startedAt}ms`
    );
    // Defaults first so a handler that resolved its own session or workflow
    // still wins.
    return res.json({ session_id: session.id, workflow: pinnedClaim, ...payload });
  };

  if (intent === "greeting") {
    const firstName = req.identity.fullName.split(" ")[0];
    const summary = capabilitySummary(req.identity);
    const chooseClient =
      isStaffRole(req.identity.role) && subject.kind === "none"
        ? " Choose a client in the portal when you want me to answer about a specific policy."
        : "";
    return send(
      answeredText(
        summary
          ? `Hello ${firstName}. ${summary}${chooseClient} What can I help with?`
          : `Hello ${firstName}. What can I help with?`
      )
    );
  }
  if (intent === "thanks") {
    return send(answeredText("You're welcome. I'm here whenever you need anything on your policy."));
  }
  if (intent === "capabilities") return send(capabilitiesResponse(req.identity));
  if (intent === "my_details")
    return send(await myDetailsResponse(req.identity, understanding, subject));
  if (intent === "quote_request")
    return send(await whatIfResponse(req.identity, understanding, session, subject));
  if (intent === "claim")
    return send(await claimResponse(req.identity, understanding, subject, session));
  if (intent === "update_request")
    return send(await addressResponse(req.identity, understanding, subject));
  if (intent === "confirm") {
    const applied = await confirmResponse(req.identity);
    if (applied) return send(applied);
    // "So I will get the full R750 000?" classifies as a confirmation and is
    // nothing of the kind. Only a genuinely bare one dead-ends here; anything
    // longer falls through and gets answered from the guide.
    if (userMessage.length <= BARE_CONFIRMATION_MAX) {
      return send(
        answeredText("There's nothing waiting for your confirmation right now. What can I help with?")
      );
    }
  }

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
      subject: subject.kind === "delegated" ? subject : null,
    });

    if (!result.grounded) {
      return send({
        session_id: result.sessionId,
        outcome: "no_grounding",
        blocks: [{ kind: "text", text: NO_GROUNDING_RESPONSE }],
        citations: [],
      });
    }

    const guarded = guardCompletion(result.text);
    if (!guarded.safe) {
      writeAudit({
        profileId: req.identity.sub,
        policyId: subject.policyId,
        role: req.identity.role,
        action: "compliance_block",
        authResult: "allowed",
        validationResult: "blocked",
        handoffFlag: true,
        reason: guarded.breach,
        sessionId: result.sessionId,
      });
      return send({
        session_id: result.sessionId,
        outcome: "escalated",
        blocks: [
          { kind: "text", text: COMPLIANCE_BLOCKED_RESPONSE },
          { kind: "escalation", reason: `answer withheld: ${guarded.breach}` },
        ],
        citations: [],
      });
    }

    return send({
      session_id: result.sessionId,
      outcome: "answered",
      blocks: [
        { kind: "text", text: guarded.text },
        // Added by code, not asked of the model: an amount quoted from the
        // guide is never this user's confirmed outcome.
        ...(guarded.needsClassification
          ? [{ kind: "text", text: POTENTIALLY_PAYABLE_NOTE }]
          : []),
      ],
      citations: result.chunks.map((chunk) => ({
        section: `${chunk.part ?? "Myriad guide"} / ${chunk.section ?? "General"}`,
        source: `Myriad technical guide p.${chunk.printed_page}`,
      })),
    });
  } catch (err) {
    console.error("chat pipeline failed", err);
    return send({
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
