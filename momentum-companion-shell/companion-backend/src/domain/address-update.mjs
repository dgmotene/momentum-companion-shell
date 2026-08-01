import { query, withTransaction } from "../db.mjs";

export const ADDRESS_FIELDS = ["street", "suburb", "city", "province", "postal_code"];

export function validateAddress(fields) {
  const missing = ADDRESS_FIELDS.filter((field) => !String(fields?.[field] ?? "").trim());
  if (missing.length) return `missing: ${missing.join(", ")}`;
  if (!/^\d{4}$/.test(fields.postal_code)) return "postal code must be exactly 4 digits";
  return null;
}

export async function currentAddress(profileId) {
  const { rows } = await query("SELECT * FROM addresses WHERE profile_id = $1", [profileId]);
  return rows[0] ?? null;
}

// Change and audit commit in one transaction; province change gets its own event.
export async function applyAddressUpdate(identity, confirmed) {
  const existing = await currentAddress(identity.sub);
  const provinceChanged = existing && existing.province !== confirmed.province;
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO addresses (profile_id, street, suburb, city, province, postal_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (profile_id) DO UPDATE SET
         street = $2, suburb = $3, city = $4, province = $5, postal_code = $6, updated_at = now()`,
      [identity.sub, ...ADDRESS_FIELDS.map((field) => confirmed[field])]
    );
    await client.query(
      `INSERT INTO audit_log (profile_id, policy_id, role, action, auth_result, validation_result)
       VALUES ($1, $2, $3, 'address_update_confirm', 'allowed', 'passed')`,
      [identity.sub, identity.policyId, identity.role]
    );
    if (provinceChanged) {
      await client.query(
        `INSERT INTO audit_log (profile_id, policy_id, role, action, auth_result, reason)
         VALUES ($1, $2, $3, 'province_changed', 'allowed', $4)`,
        [identity.sub, identity.policyId, identity.role, `province changed to ${confirmed.province}`]
      );
    }
  });
  return { previous: existing, provinceChanged };
}
