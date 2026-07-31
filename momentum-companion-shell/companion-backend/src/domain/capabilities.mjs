import { writeAudit } from "./audit.mjs";

// Role-to-capability matrix from SUBMISSION.md 5.2. "human_review" allows the
// request but routes the result to a person instead of auto-committing.
export function capabilitiesFor(identity) {
  if (identity.role === "policyholder") {
    return {
      policyQA: true,
      whatIf: true,
      selfServiceUpdate: true,
      claimsSupport: true,
      beneficiaryChange: "human_review",
      bankingChange: "human_review",
    };
  }
  if (identity.role === "beneficiary" && identity.deceasedFlag) {
    return {
      policyQA: true,
      whatIf: false,
      selfServiceUpdate: false,
      claimsSupport: true,
      beneficiaryChange: false,
      bankingChange: false,
    };
  }
  return {
    policyQA: false,
    whatIf: false,
    selfServiceUpdate: false,
    claimsSupport: false,
    beneficiaryChange: false,
    bankingChange: false,
  };
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
