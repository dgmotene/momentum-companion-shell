import { query } from "../db.mjs";

// One row per access decision (allow and deny). Never crashes the request.
export function writeAudit({
  profileId,
  policyId = null,
  role = null,
  action,
  authResult = null,
  validationResult = null,
  handoffFlag = false,
  reason = null,
  sessionId = null,
}) {
  return query(
    `INSERT INTO audit_log
       (profile_id, policy_id, role, action, auth_result, validation_result,
        handoff_flag, reason, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      profileId,
      policyId,
      role,
      action,
      authResult,
      validationResult,
      handoffFlag,
      reason,
      sessionId,
    ]
  ).catch((err) => {
    console.error("audit write failed", err);
  });
}
