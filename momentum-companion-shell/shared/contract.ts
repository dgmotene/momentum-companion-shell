// ============================================================================
// The contract between the three zones.
//
// This file is the single source of truth for anything that crosses a trust
// boundary: what a token claims, what a postMessage carries, and what the
// backend returns for a chat turn. Host, companion and backend all read it.
//
// One rule governs everything below:
//
//   THE FRONTEND DECIDES NOTHING.
//
// The capability matrix in this file exists so the UI can decide what to
// *offer*. It is not access control. Hiding a button is a courtesy to the
// user, not a security boundary. Every refusal is made by the backend after
// verifying the token, and every refusal is audited. A user who forges a
// role claim, edits our JavaScript, or calls the API directly gets exactly
// the same refusals, because the backend never asks the browser what the
// user is allowed to do.
// ============================================================================

// ----------------------------------------------------------------------------
// Roles (Appendix A of the finals brief)
// ----------------------------------------------------------------------------

export type Role =
  | "policyholder"
  | "life_insured"
  | "beneficiary"
  | "adviser"
  | "claims_assessor"
  | "service_agent";

export const ROLES: readonly Role[] = [
  "policyholder",
  "life_insured",
  "beneficiary",
  "adviser",
  "claims_assessor",
  "service_agent",
];

/**
 * Two fundamentally different kinds of user, and the distinction drives most
 * of the UI:
 *
 *  - "customer": a party to the policy, asking about their own cover.
 *    Their token names the one policy they are attached to.
 *
 *  - "staff": acting on someone else's policy within an authorised scope.
 *    Their token carries no policy of their own; it carries the set of
 *    policies they may act on. They must choose a subject before most of
 *    the product works, and every access is audited against both identities.
 *
 * The Myriad guide's "Role players" section (General information, p6-7)
 * draws the same distinction between policyholder, premium payer, insured
 * life and beneficiary, so this is the document's model, not one we invented.
 */
export type RoleKind = "customer" | "staff";

export const ROLE_KIND: Record<Role, RoleKind> = {
  policyholder: "customer",
  life_insured: "customer",
  beneficiary: "customer",
  adviser: "staff",
  claims_assessor: "staff",
  service_agent: "staff",
};

export const ROLE_LABEL: Record<Role, string> = {
  policyholder: "Policyholder",
  life_insured: "Life Insured",
  beneficiary: "Beneficiary",
  adviser: "Financial Adviser",
  claims_assessor: "Claims Assessor",
  service_agent: "Service Agent",
};

export function isStaffRole(role: Role): boolean {
  return ROLE_KIND[role] === "staff";
}

// ----------------------------------------------------------------------------
// Identity: the claims the host signs into the mock OIDC token
// ----------------------------------------------------------------------------

export interface IdentityClaims {
  /** Stable user id. Matches profiles.id in the database. */
  sub: string;

  /** Display name. Convenience for the UI; never used for a decision. */
  name: string;

  role: Role;

  /**
   * Customer roles: the policy this person is a party to.
   * Staff roles: null. Staff have no policy of their own; see `scope`.
   */
  policy_id: string | null;

  /**
   * Beneficiary only, and the single most important claim in the system.
   *
   * True means Momentum has verified the linked policyholder's death. It is
   * what unlocks the beneficiary's restricted role (Q&A and claims). While
   * it is false, a listed beneficiary has no access to the policy at all:
   * being named on a policy grants nothing until the death is verified.
   *
   * On every other role's token this is always false. A policyholder whose
   * death has been verified can no longer log in, so the combination cannot
   * occur.
   *
   * It is also why the claims checklist never asks a bereaved beneficiary
   * for a death certificate: the flag means one has already been accepted.
   */
  deceased_flag: boolean;

  /**
   * Staff roles only: the policies this person is authorised to act on.
   * `["*"]` means unrestricted (a service agent serves any caller).
   * Empty for customer roles.
   *
   * This is the authorisation. The subject a staff user is *currently*
   * looking at travels per-request as `acting_for`, and the backend checks
   * that it falls inside this scope before doing anything. Authority lives
   * in the signed token; the request only ever narrows it.
   */
  scope: string[];
}

/** Registered claims the backend insists on. */
export interface RegisteredClaims {
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export type IdentityToken = IdentityClaims & RegisteredClaims;

export const TOKEN_ISSUER = "https://mock-host.local";
export const TOKEN_AUDIENCE = "companion-backend";
export const TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Renew a little before expiry so a turn already in flight cannot land on a
 * dead token. The backend holds conversation state, so renewal is invisible:
 * a claim in progress never loses its place.
 */
export const TOKEN_RENEW_MARGIN_SECONDS = 120;

// ----------------------------------------------------------------------------
// Capabilities: what the UI may OFFER (see the rule at the top of this file)
// ----------------------------------------------------------------------------

export type Capability =
  /** Grounded questions answered from the Myriad guide. */
  | "policy_qa"
  /** See recorded policy detail: benefits, premium, status. */
  | "policy_view"
  /** Premium What-If simulation. Always an estimate, never a quote. */
  | "what_if"
  /** Low-risk self-service change, e.g. residential address. */
  | "self_service_update"
  /** High-risk changes. Never auto-applied; always queued for a human. */
  | "banking_change"
  | "beneficiary_change"
  /** Being walked through submitting or tracking a claim. */
  | "claims_guidance"
  /** Assessing someone else's claim: clauses, exclusions, evidence gaps. */
  | "claims_assessment"
  /** "What documentation is still outstanding?" */
  | "outstanding_requirements"
  /** Compare products and explain benefits across the range. */
  | "product_compare"
  /** Choose which client/policy to act on. Staff only. */
  | "select_subject"
  /** Hand off to a person. Available to everyone, always. */
  | "human_handoff";

/**
 * Derived from the typical needs listed for each persona in Appendix A.
 *
 * Read this as "what this role's screen should show", not "what this role is
 * permitted to do". The backend owns the second question and answers it
 * independently.
 */
export const UI_CAPABILITIES: Record<Role, readonly Capability[]> = {
  // "Understand and manage their own life insurance policies."
  policyholder: [
    "policy_qa",
    "policy_view",
    "what_if",
    "self_service_update",
    "banking_change",
    "beneficiary_change",
    "claims_guidance",
    "human_handoff",
  ],

  // "Understand benefits relating to the life insured under a policy."
  // Not necessarily the policyholder, so: no servicing, no simulations.
  // They can still claim (disability, critical illness) on their own life.
  life_insured: [
    "policy_qa",
    "policy_view",
    "claims_guidance",
    "outstanding_requirements",
    "human_handoff",
  ],

  // "Obtain guidance after the death of a policyholder or life insured."
  // Gated entirely on deceased_flag: see capabilitiesFor().
  beneficiary: ["policy_qa", "policy_view", "claims_guidance", "human_handoff"],

  // "Assist clients while remaining within their authorised access."
  adviser: [
    "select_subject",
    "policy_qa",
    "policy_view",
    "what_if",
    "product_compare",
    "outstanding_requirements",
    "human_handoff",
  ],

  // "Review claims efficiently using policy information and evidence."
  claims_assessor: [
    "select_subject",
    "policy_qa",
    "policy_view",
    "claims_assessment",
    "outstanding_requirements",
    "human_handoff",
  ],

  // "Support customers quickly and accurately."
  service_agent: [
    "select_subject",
    "policy_qa",
    "policy_view",
    "self_service_update",
    "banking_change",
    "claims_guidance",
    "outstanding_requirements",
    "product_compare",
    "human_handoff",
  ],
};

/** Capabilities that never auto-apply: the backend queues them for a person. */
export const REQUIRES_HUMAN_REVIEW: readonly Capability[] = [
  "banking_change",
  "beneficiary_change",
];

/**
 * The effective capability list for a token, applying the deceased-flag gate.
 *
 * A beneficiary whose linked policyholder is alive gets an empty list: no
 * Q&A, no policy view, nothing. The flag unlocks the restricted role; it
 * never upgrades anyone.
 */
export function capabilitiesFor(
  claims: Pick<IdentityClaims, "role" | "deceased_flag">
): readonly Capability[] {
  if (claims.role === "beneficiary" && !claims.deceased_flag) return [];
  return UI_CAPABILITIES[claims.role];
}

export function uiAllows(
  claims: Pick<IdentityClaims, "role" | "deceased_flag">,
  capability: Capability
): boolean {
  return capabilitiesFor(claims).includes(capability);
}

/**
 * Does this token authorise acting on the given policy?
 *
 * Mirrored deliberately: the companion uses it to avoid offering a subject
 * the user cannot have, and the backend uses it as an actual gate. Same
 * function, two very different jobs. Only the backend's answer counts.
 */
export function scopeAllows(claims: IdentityClaims, policyId: string): boolean {
  if (!isStaffRole(claims.role)) return claims.policy_id === policyId;
  return claims.scope.includes("*") || claims.scope.includes(policyId);
}

// ----------------------------------------------------------------------------
// Compliance: how a money figure may be presented
//
// Straight from the Scope Change brief. The assistant may show recorded
// amounts and estimates, and may explain what could be payable if defined
// requirements are met. It may not present any of those as a confirmed
// payout, promise an amount or a date, or imply an SLA guarantees anything.
//
// So every amount that reaches the screen carries its own classification,
// and the renderer is what enforces the distinction. Words can be phrased
// away by a model; a required prop cannot.
//
// Myriad guide p442 is the grounding: claims are assessed on merit, some are
// repudiated (nondisclosure, misrepresentation, definitions not met, benefit
// not in force, event not covered), payment follows a waterfall through
// cessionary and beneficiary for proceeds, and any debt is deducted first.
// A recorded benefit amount is therefore genuinely not a payout figure.
// ----------------------------------------------------------------------------

export type ValueClass =
  /**
   * 1. Recorded value. A contractual amount that really is on the policy.
   *    Safe to display plainly. "Your Death Benefit is R500 000."
   */
  | "recorded"
  /**
   * 2. Illustrative value. Derived from verified data but not a quote:
   *    What-If output, projections. Must always read as an estimate.
   */
  | "illustrative"
  /**
   * 3. Potentially payable. What may be payable under the policy terms if
   *    the applicable requirements are met. Must stay conditional, and must
   *    name what it is conditional on.
   */
  | "potentially_payable"
  /**
   * 4. Confirmed outcome. Only after validation and claims assessment.
   *    The backend alone may ever set this, and only from a real decision
   *    record. The frontend must never infer it.
   */
  | "confirmed";

/**
 * Copy the renderer attaches to each classification. Written once, by a
 * human, here, so no model can rephrase it and no developer can forget it.
 */
export const VALUE_CLASS_NOTE: Record<ValueClass, string | null> = {
  recorded: null, // the amount is genuinely on record; no qualifier needed
  illustrative: "Estimate only. A final quote is confirmed by a consultant.",
  potentially_payable:
    "This is what may be payable if the requirements are met. It is not a confirmed amount, and it is not a decision on any claim.",
  confirmed: null, // already assessed; the backend supplies its own wording
};

export const VALUE_CLASS_LABEL: Record<ValueClass, string> = {
  recorded: "On record",
  illustrative: "Estimate",
  potentially_payable: "Subject to assessment",
  confirmed: "Confirmed",
};

// ----------------------------------------------------------------------------
// postMessage protocol across the iframe boundary
//
// Both sides pin the other's exact origin and never use "*". Lifecycle
// messages carry no data and grant no authority: a forged one could open or
// close a panel, nothing more, because conversation state lives in the
// backend.
// ----------------------------------------------------------------------------

export const HOST_TO_COMPANION = {
  /** The signed identity token. The only message that carries a credential. */
  IDENTITY_TOKEN: "COMPANION_IDENTITY_TOKEN",
  /**
   * What the user is currently looking at on the host page, e.g. the What-If
   * Explorer's slider values, so Lumina can talk about what is on screen.
   *
   * A HINT, never an input to a decision. It arrives from another window and
   * is therefore untrusted: the backend re-derives every number it acts on
   * from the user's own verified policy data. Worst case a forged context
   * makes the assistant discuss figures that are not there.
   */
  PAGE_CONTEXT: "COMPANION_PAGE_CONTEXT",
  /** Host is going away (navigation, logout). Companion should clear state. */
  SESSION_ENDED: "COMPANION_SESSION_ENDED",
} as const;

export const COMPANION_TO_HOST = {
  /**
   * Ready-first handshake. The companion announces itself once mounted and
   * the host replies with the token. Announcing first rather than waiting
   * for a push removes the race on slow loads and covers reloads, because
   * the companion re-announces every time it mounts.
   */
  READY: "COMPANION_READY",
  /** Collapse to the launcher pill. */
  MINIMIZE: "COMPANION_MINIMIZE",
  /** Grow to full-screen. */
  EXPAND: "COMPANION_EXPAND",
  /** Return to the docked panel size. */
  RESTORE: "COMPANION_RESTORE",
  /**
   * The token is close to expiry. The host mints a fresh one and sends it
   * back over the same channel.
   *
   * Renewal is not unlimited: it only works while the companion sits inside
   * a live, authenticated portal page, so the portal session is the real
   * outer bound. Every renewal re-reads the profile, so a role change or a
   * newly set deceased flag is never more than one token life stale.
   */
  TOKEN_EXPIRING: "COMPANION_TOKEN_EXPIRING",
} as const;

export type HostToCompanionType =
  (typeof HOST_TO_COMPANION)[keyof typeof HOST_TO_COMPANION];
export type CompanionToHostType =
  (typeof COMPANION_TO_HOST)[keyof typeof COMPANION_TO_HOST];

export type HostToCompanionMessage =
  | { type: typeof HOST_TO_COMPANION.IDENTITY_TOKEN; token: string }
  | { type: typeof HOST_TO_COMPANION.PAGE_CONTEXT; context: PageContext }
  | { type: typeof HOST_TO_COMPANION.SESSION_ENDED };

export type CompanionToHostMessage =
  | { type: typeof COMPANION_TO_HOST.READY }
  | { type: typeof COMPANION_TO_HOST.MINIMIZE }
  | { type: typeof COMPANION_TO_HOST.EXPAND }
  | { type: typeof COMPANION_TO_HOST.RESTORE }
  | { type: typeof COMPANION_TO_HOST.TOKEN_EXPIRING };

/** Untrusted hint about the host page. See PAGE_CONTEXT above. */
export interface PageContext {
  /** e.g. "dashboard", "what_if_explorer". */
  page: string;
  /** Human-readable summary the assistant may reference. */
  summary?: string;
  /** Loose key/values, e.g. { sum_assured: "650000", waiting_months: "6" }. */
  fields?: Record<string, string | number>;
  /**
   * Staff roles: the policy the portal is currently displaying, so the chat
   * follows the client the user is already looking at instead of asking them
   * to choose twice.
   *
   * Untrusted, like everything else in this object, and it does not need to
   * be trusted: the backend checks whatever `acting_for` it finally receives
   * against the token's signed `scope` before doing anything with it. The
   * hint can only ever select from what the token already authorises.
   */
  acting_for?: string | null;
}

/** Panel presentation states the loader drives. */
export type CompanionSurface = "pill" | "panel" | "fullscreen";

// ----------------------------------------------------------------------------
// Chat: request
// ----------------------------------------------------------------------------

export interface ChatRequest {
  message: string;
  /** Omit to start a new conversation; the backend returns the id. */
  session_id?: string | null;
  /**
   * Staff roles: the policy being acted on. The backend rejects anything
   * outside the token's `scope`, and audits both the staff identity and the
   * subject, so "who looked at whose policy" is always answerable.
   */
  acting_for?: string | null;
  /** Untrusted hint; see HOST_TO_COMPANION.PAGE_CONTEXT. */
  page_context?: PageContext | null;
}

// ----------------------------------------------------------------------------
// Chat: outcome
//
// The backend states what it DID, as an enum. The UI then styles the turn
// from that, instead of guessing from the model's prose. A refusal that was
// worded gently still renders as a refusal, and a change that is only queued
// never renders as applied.
// ----------------------------------------------------------------------------

export type Outcome =
  /** A grounded answer was given. */
  | "answered"
  /** A low-risk change was validated and committed. */
  | "applied"
  /** Validated but deliberately not committed: a person must confirm it. */
  | "pending_review"
  /** The role does not permit this. Refused server-side and audited. */
  | "refused"
  /** Nothing in the documents scored high enough. Approved fallback used. */
  | "no_grounding"
  /** Handed to a person. */
  | "escalated"
  /** Something failed. The user sees a safe message, never a stack trace. */
  | "error";

// ----------------------------------------------------------------------------
// Chat: response blocks
//
// The reply is a list of typed blocks rather than a string, because the
// wireframes need validation ticks, before/after diffs, checklists,
// steppers and classified amounts. A string would force the renderer to
// parse prose, which is exactly the kind of guessing this architecture
// avoids everywhere else.
// ----------------------------------------------------------------------------

export type Block =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[]; ordered?: boolean }
  /** Named source, rendered as the quiet italic line under an answer. */
  | { kind: "citation"; section: string; source?: string }
  /** Field-by-field validation result, the green ticks in the wireframe. */
  | { kind: "checks"; items: { label: string; ok: boolean }[] }
  /** Before/after, for a change awaiting confirmation. */
  | { kind: "diff"; rows: { label: string; from: string; to: string }[] }
  /** A money figure. `classification` is mandatory; see ValueClass. */
  | {
      kind: "value";
      label: string;
      amount: string;
      classification: ValueClass;
      /** What the amount is conditional on, when it is conditional. */
      conditions?: string[];
      /** Comparison figure, e.g. the current premium beside an estimate. */
      compareTo?: { label: string; amount: string };
    }
  | { kind: "risk"; level: "low" | "high"; note?: string }
  | { kind: "checklist"; title?: string; items: ChecklistItem[] }
  | { kind: "stepper"; steps: { label: string; state: StepState }[] }
  /** Indicative service timeline. Permitted, but never a promise. */
  | { kind: "sla"; text: string; days?: number }
  | { kind: "reference"; label: string; value: string }
  /** Tappable follow-ups. Sending one is identical to typing it. */
  | { kind: "suggestions"; chips: string[] }
  | { kind: "escalation"; reason?: string; waitHint?: string };

export type StepState = "done" | "active" | "todo";

export interface ChecklistItem {
  id: string;
  label: string;
  /** Why it is needed, or how it was satisfied. */
  detail?: string;
  state: ChecklistState;
}

export type ChecklistState =
  | "received"
  /** Suggested next, but the user may do these in any order. */
  | "next"
  | "outstanding"
  /**
   * Already held by Momentum, so never requested.
   *
   * This is the death certificate for a bereaved beneficiary: the deceased
   * flag means one has already been verified. The single document a grieving
   * person most dreads producing is the one we never ask for.
   */
  | "on_file";

// ----------------------------------------------------------------------------
// Chat: workflow state
//
// The backend's pinned workflow card, exposed so the UI can render it. The
// wireframe's "Where things stand, in your own time" panel and the claims
// checklist are this object made visible.
//
// The model never tracks this. It is told, every turn, exactly where things
// stand, which is why a grieving user can interrupt a claim to ask an
// unrelated question, leave for a day, and resume without being re-asked
// anything.
// ----------------------------------------------------------------------------

export type Journey =
  | "none"
  | "policy_qa"
  | "what_if"
  | "address_update"
  | "banking_update"
  | "beneficiary_update"
  | "claim"
  | "claim_assessment";

export type ClaimType =
  | "death"
  | "funeral"
  | "terminal_illness"
  | "income_protection"
  | "disability"
  | "critical_illness"
  | "retrenchment";

export interface WorkflowState {
  journey: Journey;
  claim_type?: ClaimType | null;
  /** Fields captured so far, in any order the user offered them. */
  collected: Record<string, string>;
  /** Fields still needed. The assistant asks only for these. */
  missing: string[];
  checklist?: ChecklistItem[];
  /** Indicative working days once everything is in. Never a promise. */
  sla_days?: number | null;
}

// ----------------------------------------------------------------------------
// Chat: response
// ----------------------------------------------------------------------------

export interface ChatResponse {
  session_id: string;
  outcome: Outcome;
  blocks: Block[];
  /** Sections the answer was built from. Empty means nothing was retrieved. */
  citations: Citation[];
  workflow?: WorkflowState | null;
  /** Ticket the user can quote, e.g. "UPD-30517". */
  reference?: string | null;
  /**
   * The audit row this turn wrote. Surfaced so the demo can show that every
   * decision, including every refusal, left a record.
   */
  audit_id?: string | null;
  /** Present when outcome is "refused": plain reason, never internals. */
  refusal_reason?: string | null;
}

export interface Citation {
  /** Heading from the Myriad guide, e.g. "Death Benefit / Claim amount". */
  section: string;
  /** e.g. "Myriad technical guide p.36". */
  source?: string;
}

// ----------------------------------------------------------------------------
// The approved fallback, word for word.
//
// Used when retrieval finds nothing above the similarity threshold. In that
// case the model is never called at all, so there is no opportunity for a
// guess to reach the user.
// ----------------------------------------------------------------------------

export const NO_GROUNDING_RESPONSE =
  "I can't confirm that from the provided documents. I can explain what is available or refer this for human review.";

// ----------------------------------------------------------------------------
// Shared endpoint paths, so the two sides cannot drift.
// ----------------------------------------------------------------------------

export const API = {
  VERIFY: "/api/verify",
  CHAT: "/api/chat",
  SESSION: "/api/session",
  HEALTH: "/health",
} as const;

export const HOST_API = {
  TOKEN: "/api/token",
  JWKS: "/.well-known/jwks.json",
} as const;
