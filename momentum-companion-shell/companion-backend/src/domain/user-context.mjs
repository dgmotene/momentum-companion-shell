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

const STATUS_WORDS = {
  active: "active",
  claim_pending: "active, with a claim in progress",
  lapsed: "lapsed",
  paid_up: "paid up",
};

/** "a, b and c", so a list of benefits reads as a sentence. */
function joinNaturally(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Someone's own record, said the way a person would say it. Sentences rather
// than "Label: value" rows, because this is a conversation.
//
// `target` narrows the answer to the one detail asked for: someone who asks
// for their address should not be handed their whole file back.
//
// Recorded amounts are safe to state plainly, and the Scope Change says so
// explicitly, so they sit in the prose. `amounts` carries the value badge only
// when the amount IS the question, rather than repeating every figure twice.
export function describeUserRecord(userContext, target = null, aboutSomeoneElse = false) {
  if (!userContext?.profile) return { sentences: [], amounts: [] };

  const wants = (category) => target === null || target === category;
  const their = aboutSomeoneElse ? "Their" : "Your";
  const theyPay = aboutSomeoneElse ? "They pay" : "You pay";
  const theyNominated = aboutSomeoneElse ? "They have nominated" : "You have nominated";
  const heldFor = aboutSomeoneElse ? "on file is" : "we have for you is";
  const sentences = [];
  const amounts = [];
  const policy = userContext.policy;

  if (policy && wants("policy")) {
    const status = STATUS_WORDS[policy.status] ?? policy.status;
    sentences.push(`${their} ${policy.product_name} policy, ${policy.policy_id}, is ${status}.`);
  }

  if (policy && wants("cover")) {
    const cover = formatRand(policy.sum_assured);
    if (target === "cover") {
      amounts.push({ label: "Recorded cover amount", amount: cover });
    } else {
      sentences.push(`The cover recorded on it is ${cover}.`);
    }
  }

  if (policy && policy.monthly_premium !== null && wants("premium")) {
    const premium = formatRand(policy.monthly_premium);
    if (target === "premium") {
      amounts.push({ label: "Monthly premium", amount: premium });
    } else {
      sentences.push(`${theyPay} ${premium} a month.`);
    }
  }

  if (wants("benefits") && userContext.benefits.length) {
    const benefits = userContext.benefits.map(
      (benefit) => `${benefit.benefit_name} of ${formatRand(benefit.cover_amount)}`
    );
    sentences.push(`It includes ${joinNaturally(benefits)}.`);
  }

  if (userContext.address && wants("address")) {
    const parts = [
      userContext.address.street,
      userContext.address.suburb,
      userContext.address.city,
      userContext.address.province,
      userContext.address.postal_code,
    ].filter(Boolean);
    sentences.push(`The address ${heldFor} ${parts.join(", ")}.`);
  }

  if (userContext.banking && wants("banking")) {
    sentences.push(
      `${their} premiums come from a ${userContext.banking.bank_name} account ending ${userContext.banking.account_last4}.`
    );
  }

  if (wants("beneficiaries") && userContext.beneficiaries.length) {
    const nominated = userContext.beneficiaries.map(
      (beneficiary) =>
        `${beneficiary.full_name}, ${beneficiary.relationship}, for ${beneficiary.percentage}%`
    );
    sentences.push(`${theyNominated} ${joinNaturally(nominated)}.`);
  }

  if (wants("claims") && userContext.claims.length) {
    const claims = userContext.claims.map(
      (claim) => `a ${claim.claim_type} claim, ${String(claim.status).replace(/_/g, " ")}`
    );
    sentences.push(`There is ${joinNaturally(claims)} on record.`);
  }

  return { sentences, amounts };
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
