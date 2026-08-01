// What each persona can actually ask for, in their own terms. Human-written:
// this is the first thing most people type, and the answer is a description of
// the product rather than a claim about a policy, so no model and no retrieval.
// Kept in step with the matrix in capabilities.mjs by hand.

const SUMMARY_BY_ROLE = {
  policyholder:
    "I can look things up in your policy documents, estimate what a change to your cover would cost, update your address, and walk you through a claim. Banking and beneficiary changes I hand to a person to confirm, for your protection.",

  life_insured:
    "You are covered under this policy, so I can explain the benefits on your life, the eligibility and medical requirements, and what a claim would need. I cannot change the policy itself; only the policyholder can do that.",

  beneficiary:
    "I can explain the claims process, exactly which documents are needed, the expected timelines, and what happens at each step. There is no rush, and you can stop and come back whenever you need to.",

  adviser:
    "I can answer product questions from the Myriad guide, explain how benefits compare, and run premium estimates. Everything you ask is recorded against your name. Changing a client's details is not something I can do for you.",

  claims_assessor:
    "I can locate policy clauses and exclusions, tell you what a given claim type requires, and list the evidence a claim is still missing.",

  service_agent:
    "I can answer policy questions, tell you what a claim requires, and walk a customer through a change. Anything that alters a customer's record goes to a person to confirm rather than being applied here.",
};

export function capabilitySummary(identity) {
  if (identity.role === "beneficiary" && !identity.deceasedFlag) return null;
  return SUMMARY_BY_ROLE[identity.role] ?? null;
}
