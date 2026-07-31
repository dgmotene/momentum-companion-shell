import { Router } from "express";
import { createHash } from "node:crypto";
import { query, withTransaction } from "../db.mjs";
import { requireAuth } from "../auth/middleware.mjs";
import { capabilitiesFor, requireCapability } from "./capabilities.mjs";
import { writeAudit } from "./audit.mjs";
import { estimatePremium } from "./whatif.mjs";
import { claimChecklist, CLAIM_TYPE_KEYS } from "./claims-content.mjs";

const ADDRESS_FIELDS = ["street", "suburb", "city", "province", "postal_code"];

const router = Router();
router.use(["/api/me", "/api/policy", "/api/whatif", "/api/claims"], requireAuth);

async function loadPolicy(policyId) {
  const [policy, benefits, nominated] = await Promise.all([
    query("SELECT * FROM policies WHERE policy_id = $1", [policyId]),
    query(
      "SELECT benefit_name, cover_amount FROM policy_benefits WHERE policy_id = $1",
      [policyId]
    ),
    query(
      "SELECT full_name, relationship, percentage FROM policy_beneficiaries WHERE policy_id = $1",
      [policyId]
    ),
  ]);
  if (!policy.rows[0]) return null;
  return {
    ...policy.rows[0],
    benefits: benefits.rows,
    nominated_beneficiaries: nominated.rows,
  };
}

router.get("/api/me", async (req, res) => {
  const capabilities = capabilitiesFor(req.identity);
  const policy = capabilities.policyQA
    ? await loadPolicy(req.identity.policyId)
    : null;
  res.json({
    profile: {
      id: req.identity.sub,
      full_name: req.identity.fullName,
      role: req.identity.role,
      deceased_flag: req.identity.deceasedFlag,
    },
    policy_summary: policy && {
      policy_id: policy.policy_id,
      product_name: policy.product_name,
      status: policy.status,
    },
    capabilities,
  });
});

router.get(
  "/api/policy",
  requireCapability("policyQA"),
  async (req, res) => {
    const policy = await loadPolicy(req.identity.policyId);
    if (!policy) return res.status(404).json({ error: "policy not found" });
    writeAudit({
      profileId: req.identity.sub,
      policyId: policy.policy_id,
      role: req.identity.role,
      action: "view_policy",
      authResult: "allowed",
    });
    if (req.identity.role === "policyholder") return res.json(policy);
    // Flagged beneficiary: only what a claim needs, no premiums or financials.
    return res.json({
      policy_id: policy.policy_id,
      product_name: policy.product_name,
      status: policy.status,
      benefits: policy.benefits,
      nominated_beneficiaries: policy.nominated_beneficiaries,
    });
  }
);

router.post(
  "/api/whatif",
  requireCapability("whatIf"),
  async (req, res) => {
    const policy = await loadPolicy(req.identity.policyId);
    if (!policy) return res.status(404).json({ error: "policy not found" });
    const estimate = estimatePremium({
      currentPremium: Number(policy.monthly_premium),
      currentSum: Number(policy.sum_assured),
      requestedSum: Number(req.body?.requestedSum),
      waitingMonths: Number(req.body?.waitingMonths ?? 0),
    });
    writeAudit({
      profileId: req.identity.sub,
      policyId: policy.policy_id,
      role: req.identity.role,
      action: "whatif_estimate",
      authResult: "allowed",
      validationResult: estimate.error ? `rejected: ${estimate.error}` : "passed",
    });
    if (estimate.error) return res.status(422).json({ error: estimate.error });
    res.json(estimate);
  }
);

router.get(
  "/api/claims/guidance",
  requireCapability("claimsSupport"),
  async (req, res) => {
    const claimType = req.query.type ?? "death";
    const checklist = claimChecklist(claimType, {
      deceasedFlag: req.identity.deceasedFlag,
    });
    if (!checklist) {
      return res
        .status(422)
        .json({ error: `type must be one of ${CLAIM_TYPE_KEYS.join(", ")}` });
    }
    const existingClaims = await query(
      "SELECT id, claim_type, status, created_at FROM claims WHERE policy_id = $1",
      [req.identity.policyId]
    );
    writeAudit({
      profileId: req.identity.sub,
      policyId: req.identity.policyId,
      role: req.identity.role,
      action: `claims_guidance:${claimType}`,
      authResult: "allowed",
    });
    res.json({ ...checklist, existing_claims: existingClaims.rows });
  }
);

function validateAddress(body) {
  const missing = ADDRESS_FIELDS.filter(
    (field) => !String(body?.[field] ?? "").trim()
  );
  if (missing.length) return `missing: ${missing.join(", ")}`;
  if (!/^\d{4}$/.test(body.postal_code)) {
    return "postal code must be exactly 4 digits";
  }
  return null;
}

function addressConfirmToken(sub, body) {
  const canonical = ADDRESS_FIELDS.map((field) => body[field].trim()).join("|");
  return createHash("sha256").update(`${sub}|${canonical}`).digest("hex").slice(0, 32);
}

router.post(
  "/api/policy/address/propose",
  requireCapability("selfServiceUpdate"),
  async (req, res) => {
    const validationError = validateAddress(req.body);
    writeAudit({
      profileId: req.identity.sub,
      policyId: req.identity.policyId,
      role: req.identity.role,
      action: "address_update_propose",
      authResult: "allowed",
      validationResult: validationError ? `rejected: ${validationError}` : "passed",
    });
    if (validationError) return res.status(422).json({ error: validationError });
    const proposed = Object.fromEntries(
      ADDRESS_FIELDS.map((field) => [field, req.body[field].trim()])
    );
    res.json({
      readback: `Please confirm your new address: ${proposed.street}, ${proposed.suburb}, ${proposed.city}, ${proposed.province}, ${proposed.postal_code}.`,
      proposed,
      confirm_token: addressConfirmToken(req.identity.sub, proposed),
    });
  }
);

router.post(
  "/api/policy/address/confirm",
  requireCapability("selfServiceUpdate"),
  async (req, res) => {
    const validationError = validateAddress(req.body);
    if (validationError) return res.status(422).json({ error: validationError });
    const confirmed = Object.fromEntries(
      ADDRESS_FIELDS.map((field) => [field, req.body[field].trim()])
    );
    if (req.body?.confirm_token !== addressConfirmToken(req.identity.sub, confirmed)) {
      return res.status(400).json({ error: "confirm token does not match the proposed address" });
    }
    const currentAddress = await query(
      "SELECT province FROM addresses WHERE profile_id = $1",
      [req.identity.sub]
    );
    const provinceChanged =
      currentAddress.rows[0] &&
      currentAddress.rows[0].province !== confirmed.province;

    // Spec: the change and its audit entry commit in one transaction.
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO addresses (profile_id, street, suburb, city, province, postal_code, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (profile_id) DO UPDATE SET
           street = $2, suburb = $3, city = $4, province = $5, postal_code = $6, updated_at = now()`,
        [req.identity.sub, ...ADDRESS_FIELDS.map((field) => confirmed[field])]
      );
      await client.query(
        `INSERT INTO audit_log (profile_id, policy_id, role, action, auth_result, validation_result)
         VALUES ($1, $2, $3, 'address_update_confirm', 'allowed', 'passed')`,
        [req.identity.sub, req.identity.policyId, req.identity.role]
      );
      if (provinceChanged) {
        await client.query(
          `INSERT INTO audit_log (profile_id, policy_id, role, action, auth_result, reason)
           VALUES ($1, $2, $3, 'province_changed', 'allowed', $4)`,
          [
            req.identity.sub,
            req.identity.policyId,
            req.identity.role,
            `province changed to ${confirmed.province}`,
          ]
        );
      }
    });
    res.json({ updated: true, address: confirmed });
  }
);

router.post(
  "/api/policy/banking/change",
  requireCapability("bankingChange"),
  async (req, res) => {
    // High-risk change: never auto-committed, always routed to a person.
    writeAudit({
      profileId: req.identity.sub,
      policyId: req.identity.policyId,
      role: req.identity.role,
      action: "banking_change_requested",
      authResult: "allowed",
      validationResult: "pending human review",
      handoffFlag: true,
      reason: "banking changes always require human review",
    });
    res.status(202).json({
      queued_for_human_review: true,
      message:
        "Banking changes are always confirmed by a person for your protection. A consultant will contact you to verify this change before anything is updated.",
    });
  }
);

export default router;
