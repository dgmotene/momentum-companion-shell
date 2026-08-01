import { verifyIdentityToken, isKeyFetchError, HOST_ORIGIN } from "./verify.mjs";
import { query } from "../db.mjs";

export async function requireAuth(req, res, next) {
  const authHeader = req.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "missing bearer token" });
  }

  let claims;
  try {
    claims = await verifyIdentityToken(token);
  } catch (err) {
    if (isKeyFetchError(err)) {
      return res.status(503).json({
        error: `could not fetch the signing key from ${HOST_ORIGIN}/.well-known/jwks.json; is the host running?`,
      });
    }
    return res.status(401).json({ error: err.code });
  }

  try {
    const profileResult = await query(
      `SELECT profile.id, profile.full_name, profile.role, profile.policy_id,
              profile.deceased_flag, linked.deceased_flag AS linked_deceased_flag
         FROM profiles profile
         LEFT JOIN profiles linked ON linked.id = profile.linked_to
        WHERE profile.id = $1`,
      [claims.sub]
    );
    const profile = profileResult.rows[0];
    if (!profile) {
      return res.status(401).json({ error: "token subject has no profile" });
    }

    // A beneficiary's effective flag mirrors the linked policyholder's row,
    // resolved from the database, never trusted from the token.
    const deceasedFlag =
      profile.role === "beneficiary"
        ? profile.linked_deceased_flag === true
        : profile.deceased_flag === true;

    req.identity = {
      sub: profile.id,
      fullName: profile.full_name,
      role: profile.role,
      policyId: profile.policy_id,
      deceasedFlag,
      scope: Array.isArray(claims.scope) ? claims.scope : [],
    };
    return next();
  } catch (err) {
    console.error("profile lookup failed", err);
    return res.status(500).json({ error: "profile lookup failed" });
  }
}
