// Everything the answering model is allowed to know about the person asking,
// gathered in one round of queries. Adapted from the work on the modise branch.
//
// Two rules hold this together. Reads are scoped to the caller's own profile,
// never a profile id supplied by the client. And each field is gated on role,
// so a beneficiary's prompt never carries the policyholder's banking record.

import { query } from "../db.mjs";

// A missing table means the corpus or a migration has not been applied yet.
// That should degrade the answer, not fail the whole turn.
async function safeQuery(sql, params = []) {
  try {
    return await query(sql, params);
  } catch (error) {
    if (error?.code === "42P01" || /relation .* does not exist/i.test(error.message)) {
      return { rows: [] };
    }
    throw error;
  }
}

const EMPTY_CONTEXT = {
  profile: null,
  policy: null,
  benefits: [],
  address: null,
  banking: null,
  beneficiaries: [],
  claims: [],
};

const ROLES_WITH_CLAIM_VISIBILITY = ["policyholder", "beneficiary", "claims_assessor"];

// Matches the boundary /api/policy already enforces: a beneficiary sees what a
// claim needs, never premiums. Stripped here rather than in the formatter so no
// future caller can reach it either.
const ROLES_WITH_PREMIUM_VISIBILITY = ["policyholder", "adviser"];

export async function loadUserContext({ profileId, policyId, role }) {
  if (!profileId) return EMPTY_CONTEXT;

  const profileResult = await safeQuery(
    `SELECT id, full_name, role, policy_id, deceased_flag, linked_to
     FROM profiles WHERE id = $1`,
    [profileId]
  );
  const profile = profileResult.rows[0] ?? null;
  if (!profile) return EMPTY_CONTEXT;

  const resolvedPolicyId = profile.policy_id ?? policyId ?? null;
  const noRows = Promise.resolve({ rows: [] });

  const [policyResult, benefitsResult, addressResult, bankingResult, beneficiariesResult, claimsResult] =
    await Promise.all([
      resolvedPolicyId
        ? safeQuery(
            `SELECT policy_id, product_name, sum_assured, monthly_premium, status, start_date
             FROM policies WHERE policy_id = $1`,
            [resolvedPolicyId]
          )
        : noRows,
      resolvedPolicyId
        ? safeQuery(
            `SELECT benefit_name, cover_amount
             FROM policy_benefits WHERE policy_id = $1 ORDER BY benefit_name`,
            [resolvedPolicyId]
          )
        : noRows,
      safeQuery(
        `SELECT street, suburb, city, province, postal_code
         FROM addresses WHERE profile_id = $1`,
        [profileId]
      ),
      // Only the policyholder's own banking record, and only ever the last four.
      role === "policyholder"
        ? safeQuery(
            `SELECT bank_name, account_holder, account_last4
             FROM banking_details WHERE profile_id = $1`,
            [profileId]
          )
        : noRows,
      resolvedPolicyId
        ? safeQuery(
            `SELECT full_name, relationship, percentage
             FROM policy_beneficiaries WHERE policy_id = $1 ORDER BY full_name`,
            [resolvedPolicyId]
          )
        : noRows,
      ROLES_WITH_CLAIM_VISIBILITY.includes(role)
        ? safeQuery(
            `SELECT id, policy_id, claim_type, status, created_at
             FROM claims WHERE claimant_profile_id = $1 ORDER BY created_at DESC`,
            [profileId]
          )
        : noRows,
    ]);

  const policy = policyResult.rows[0] ?? null;
  if (policy && !ROLES_WITH_PREMIUM_VISIBILITY.includes(role)) {
    policy.monthly_premium = null;
  }

  return {
    profile,
    policy,
    benefits: benefitsResult.rows,
    address: addressResult.rows[0] ?? null,
    banking: bankingResult.rows[0] ?? null,
    beneficiaries: beneficiariesResult.rows,
    claims: claimsResult.rows,
  };
}

const formatRand = (amount) => `R${Number(amount).toLocaleString("en-ZA")}`;

// For showing someone their own record. Money is returned separately from the
// plain facts so every amount can go out as a classified value block rather
// than as unlabelled prose in a list.
export function describeUserRecord(userContext) {
  if (!userContext?.profile) return { facts: [], amounts: [] };

  const facts = [];
  const amounts = [];

  if (userContext.policy) {
    facts.push(
      `Policy ${userContext.policy.policy_id}: ${userContext.policy.product_name}, status ${userContext.policy.status}`
    );
    amounts.push({
      label: "Recorded cover amount",
      amount: formatRand(userContext.policy.sum_assured),
    });
    if (userContext.policy.monthly_premium !== null) {
      amounts.push({
        label: "Monthly premium",
        amount: formatRand(userContext.policy.monthly_premium),
      });
    }
  }

  for (const benefit of userContext.benefits) {
    facts.push(`Benefit: ${benefit.benefit_name}, ${formatRand(benefit.cover_amount)}`);
  }

  if (userContext.address) {
    const parts = [
      userContext.address.street,
      userContext.address.suburb,
      userContext.address.city,
      userContext.address.province,
      userContext.address.postal_code,
    ].filter(Boolean);
    facts.push(`Address on file: ${parts.join(", ")}`);
  }

  if (userContext.banking) {
    facts.push(
      `Banking: ${userContext.banking.bank_name}, account ending ${userContext.banking.account_last4}`
    );
  }

  for (const beneficiary of userContext.beneficiaries) {
    facts.push(
      `Beneficiary: ${beneficiary.full_name}, ${beneficiary.relationship}, ${beneficiary.percentage}%`
    );
  }

  for (const claim of userContext.claims) {
    facts.push(`Claim on record: ${claim.claim_type}, ${claim.status}`);
  }

  return { facts, amounts };
}

// Recorded values only. The wording matters: the model must not present any of
// these as an amount that will be paid.
export function formatUserContextForPrompt(userContext, role) {
  if (!userContext?.profile) return "";

  const lines = ["Their record on file (recorded values, never final payouts):"];
  lines.push(`- Name: ${userContext.profile.full_name}`);
  lines.push(`- Role: ${userContext.profile.role}`);

  if (userContext.policy) {
    const startDate =
      userContext.policy.start_date?.toISOString?.().slice(0, 10) ??
      userContext.policy.start_date;
    lines.push(
      `- Policy ${userContext.policy.policy_id}: ${userContext.policy.product_name}, status ${userContext.policy.status}, started ${startDate}`
    );
    lines.push(`- Recorded cover amount: ${formatRand(userContext.policy.sum_assured)}`);
    if (userContext.policy.monthly_premium !== null) {
      lines.push(`- Monthly premium: ${formatRand(userContext.policy.monthly_premium)}`);
    }
  }

  if (userContext.benefits.length) {
    const benefits = userContext.benefits
      .map((benefit) => `${benefit.benefit_name} (${formatRand(benefit.cover_amount)})`)
      .join("; ");
    lines.push(`- Benefits on the policy: ${benefits}`);
  }

  if (userContext.address) {
    const parts = [
      userContext.address.street,
      userContext.address.suburb,
      userContext.address.city,
      userContext.address.province,
      userContext.address.postal_code,
    ].filter(Boolean);
    lines.push(`- Address on file: ${parts.join(", ")}`);
  }

  if (userContext.banking && role === "policyholder") {
    lines.push(
      `- Banking: ${userContext.banking.bank_name}, account ending ${userContext.banking.account_last4}`
    );
  }

  if (userContext.beneficiaries.length) {
    const nominated = userContext.beneficiaries
      .map((beneficiary) => `${beneficiary.full_name} (${beneficiary.relationship}, ${beneficiary.percentage}%)`)
      .join("; ");
    lines.push(`- Nominated beneficiaries: ${nominated}`);
  }

  if (userContext.claims.length) {
    const claims = userContext.claims
      .map((claim) => `${claim.claim_type} (${claim.status})`)
      .join("; ");
    lines.push(`- Claims on record: ${claims}`);
  }

  return lines.join("\n");
}
