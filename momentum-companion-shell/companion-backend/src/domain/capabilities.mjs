import { writeAudit } from "./audit.mjs";

// Role-to-capability matrix for the six personas in Appendix A of the brief.
// "human_review" allows the request but routes the result to a person instead
// of auto-committing. A role missing from this table is denied everything, so
// adding a role without deciding its capabilities fails closed.
const NOTHING_ALLOWED = {
  policyQA: false,
  whatIf: false,
  selfServiceUpdate: false,
  claimsSupport: false,
  beneficiaryChange: false,
  bankingChange: false,
};

const CAPABILITIES_BY_ROLE = {
  // Manages their own policy, so the only role that may alter it.
  policyholder: {
    ...NOTHING_ALLOWED,
    policyQA: true,
    whatIf: true,
    selfServiceUpdate: true,
    claimsSupport: true,
    beneficiaryChange: "human_review",
    bankingChange: "human_review",
  },

  // Covered by the policy but does not own it: benefits and claim
  // requirements on their own life, never servicing or simulations.
  life_insured: {
    ...NOTHING_ALLOWED,
    policyQA: true,
    claimsSupport: true,
  },

  // Only after Momentum has verified the death; see the gate below.
  beneficiary: {
    ...NOTHING_ALLOWED,
    policyQA: true,
    claimsSupport: true,
  },

  // Acts for a client within their authorised book. Simulations are part of
  // preparing for a client meeting; changing client details is not.
  adviser: {
    ...NOTHING_ALLOWED,
    policyQA: true,
    whatIf: true,
  },

  // Assesses a submitted claim: clauses, exclusions, evidence outstanding.
  claims_assessor: {
    ...NOTHING_ALLOWED,
    policyQA: true,
    claimsSupport: true,
  },

  // Front line. May walk a customer through a change, but a change made on
  // someone else's behalf is confirmed by a person, never auto-committed.
  service_agent: {
    ...NOTHING_ALLOWED,
    policyQA: true,
    claimsSupport: true,
    selfServiceUpdate: "human_review",
    bankingChange: "human_review",
  },
};

export function capabilitiesFor(identity) {
  if (identity.role === "beneficiary" && !identity.deceasedFlag) {
    return NOTHING_ALLOWED;
  }
  return CAPABILITIES_BY_ROLE[identity.role] ?? NOTHING_ALLOWED;
}

const REFUSALS = {
  noAccessYet:
    "I can't share policy information with you yet. Access opens once Momentum has verified the policyholder's passing. If you believe this is in error, I can connect you with a person.",
  notForRole:
    "That action isn't available on your profile. I can help you with questions about the policy and with a claim.",
};

export function requireCapability(action) {
  return (req, res, next) => {
    const allowed = capabilitiesFor(req.identity)[action];
    if (allowed) {
      req.capability = allowed;
      return next();
    }
    const reason =
      req.identity.role === "beneficiary" && !req.identity.deceasedFlag
        ? "beneficiary without verified deceased flag"
        : `role ${req.identity.role} may not ${action}`;
    writeAudit({
      profileId: req.identity.sub,
      policyId: req.identity.policyId,
      role: req.identity.role,
      action,
      authResult: "denied",
      reason,
    });
    const message =
      req.identity.role === "beneficiary" && !req.identity.deceasedFlag
        ? REFUSALS.noAccessYet
        : REFUSALS.notForRole;
    return res.status(403).json({ error: "not permitted", message, reason });
  };
}
