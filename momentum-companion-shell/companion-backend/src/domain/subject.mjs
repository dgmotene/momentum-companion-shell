// Who a request is about, as opposed to who is making it.
//
// `acting_for` arrives from the browser, so an adviser must clear both the
// token's scope and their recorded book before it becomes the subject. Only a
// policy id crosses the boundary; the profile behind it is resolved here, so
// no caller-supplied profile id ever scopes a read.

import { query } from "../db.mjs";

const STAFF_ROLES = ["adviser", "claims_assessor", "service_agent"];

export function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

function scopeAllows(scope, policyId) {
  if (!Array.isArray(scope)) return false;
  return scope.includes("*") || scope.includes(policyId);
}

async function bookRecordsClient(adviserId, policyId) {
  const { rows } = await query(
    `SELECT 1
       FROM adviser_clients book
       JOIN profiles client ON client.id = book.client_profile_id
      WHERE book.adviser_id = $1 AND client.policy_id = $2
      LIMIT 1`,
    [adviserId, policyId]
  );
  return rows.length > 0;
}

// The owner, not merely someone attached: a policy also carries a beneficiary
// and a life insured.
async function policyholderFor(policyId) {
  const { rows } = await query(
    `SELECT id, deceased_flag FROM profiles
      WHERE policy_id = $1 AND role = 'policyholder' LIMIT 1`,
    [policyId]
  );
  return rows[0] ?? null;
}

/**
 * @returns {Promise<
 *   | { kind: "self", profileId: string, policyId: string|null, deceasedFlag: boolean }
 *   | { kind: "none", profileId: null, policyId: null, deceasedFlag: false }
 *   | { kind: "delegated", profileId: string, policyId: string, deceasedFlag: boolean, name: string }
 *   | { kind: "denied", reason: string }
 * >}
 */
export async function resolveSubject(identity, requestedPolicyId) {
  if (!isStaffRole(identity.role)) {
    return {
      kind: "self",
      profileId: identity.sub,
      policyId: identity.policyId,
      deceasedFlag: identity.deceasedFlag,
    };
  }

  const actingFor = typeof requestedPolicyId === "string" ? requestedPolicyId.trim() : "";
  if (!actingFor) {
    return { kind: "none", profileId: null, policyId: null, deceasedFlag: false };
  }

  if (!scopeAllows(identity.scope, actingFor)) {
    return {
      kind: "denied",
      reason: `${actingFor} is outside the scope on this token`,
    };
  }

  if (identity.role === "adviser" && !(await bookRecordsClient(identity.sub, actingFor))) {
    return {
      kind: "denied",
      reason: `${actingFor} is not a client on this adviser's book`,
    };
  }

  const policyholder = await policyholderFor(actingFor);
  if (!policyholder) {
    return { kind: "denied", reason: `no policyholder is recorded against ${actingFor}` };
  }

  return {
    kind: "delegated",
    profileId: policyholder.id,
    policyId: actingFor,
    deceasedFlag: policyholder.deceased_flag === true,
  };
}
