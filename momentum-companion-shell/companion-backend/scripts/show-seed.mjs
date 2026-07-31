import { query, end } from "../src/db.mjs";

const TABLES = [
  "profiles",
  "adviser_clients",
  "policies",
  "policy_benefits",
  "policy_beneficiaries",
  "addresses",
  "banking_details",
  "claims",
  "audit_log",
];

for (const table of TABLES) {
  const result = await query(`SELECT * FROM ${table} ORDER BY 1`);
  console.log(`\n=== ${table} (${result.rowCount} rows) ===`);
  if (result.rowCount > 0) console.table(result.rows);
}

await end();
