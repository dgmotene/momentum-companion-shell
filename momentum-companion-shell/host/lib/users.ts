// The portal's user directory. SERVER ONLY.
//
// `import "server-only"` makes it a build error for any client component to
// pull this in, which matters because this module holds credentials. If
// someone imports it into a React component by accident, the build fails
// rather than shipping passwords to the browser.
//
// This stands in for Momentum's identity provider. What it does NOT do is let
// the browser choose an identity: the client sends an email and a password,
// and the server decides who that is.
//
// ---------------------------------------------------------------------------
// THE DATABASE IS AUTHORITATIVE.
//
// `sub` here must match profiles.id in db/seed.sql, because the companion
// backend's requireAuth re-reads the profile from Postgres on every request
// and does not trust the token's own copy of the claims. A sub that is not in
// profiles gets "token subject has no profile" and a 401.
//
// The one claim worth calling out: the backend recomputes `deceased_flag`
// itself, resolving a beneficiary's effective flag from the LINKED
// policyholder's row via profiles.linked_to. So the value below is only what
// the portal believes; the backend's answer is the one that decides anything.
//
// Emails and passwords match host/app/lib/mockPortalData.ts, so the login
// screen's published hints keep working.
// ---------------------------------------------------------------------------

import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { IdentityClaims } from "@shared/contract";

export interface DirectoryUser {
  email: string;
  /** Seeded demo credential, published on the login screen on purpose. */
  password: string;
  claims: IdentityClaims;
  initials: string;
}

/** Shared by every demo account, as in mockPortalData.ts. */
const DEMO_PASSWORD = "password123";

const USERS: DirectoryUser[] = [
  // user-001 · Thandi Mokoena · POL-1001 (R500 000 at R300/month, 0-month wait)
  {
    email: "member@momentum.test",
    password: DEMO_PASSWORD,
    initials: "TM",
    claims: {
      sub: "user-001",
      name: "Thandi Mokoena",
      role: "policyholder",
      policy_id: "POL-1001",
      deceased_flag: false,
      scope: [],
    },
  },

  // user-003 · Sipho Dlamini · son of the late Nomsa Dlamini (user-002).
  // His token's flag is TRUE because the LINKED policyholder's row has it set;
  // the backend confirms that independently via linked_to.
  {
    email: "beneficiary@momentum.test",
    password: DEMO_PASSWORD,
    initials: "SD",
    claims: {
      sub: "user-003",
      name: "Sipho Dlamini",
      role: "beneficiary",
      policy_id: "POL-1002",
      deceased_flag: true,
      scope: [],
    },
  },

  // user-004 · Bongani Mokoena · named on POL-1001, but Thandi is alive.
  // Not in mockPortalData, so this email is new. Worth having: it is the
  // clearest proof that being named on a policy grants nothing until a death
  // has been verified.
  {
    email: "pending@momentum.test",
    password: DEMO_PASSWORD,
    initials: "BM",
    claims: {
      sub: "user-004",
      name: "Bongani Mokoena",
      role: "beneficiary",
      policy_id: "POL-1001",
      deceased_flag: false,
      scope: [],
    },
  },

  // user-005 · Lindiwe Mokoena · the life insured on Thandi's POL-1001.
  // Policyholder and life insured are different people, which the finals brief
  // calls out and the Myriad guide's Role players section treats as separate
  // parties.
  {
    email: "insured@momentum.test",
    password: DEMO_PASSWORD,
    initials: "LM",
    claims: {
      sub: "user-005",
      name: "Lindiwe Mokoena",
      role: "life_insured",
      policy_id: "POL-1001",
      deceased_flag: false,
      scope: [],
    },
  },

  // --- Staff -------------------------------------------------------------
  // No policy of their own. `scope` lists the policies they may act on; the
  // policy actually being viewed travels per-request as `acting_for`.
  //
  // NOTE: db/seed.sql models the adviser's book as an `adviser_clients` join
  // table keyed on CLIENT PROFILE ids (user-001, user-002), not policy ids.
  // The scopes below are the policy-id equivalent of those rows. Until the
  // backend resolves one from the other, this mapping is maintained by hand.
  {
    email: "adviser@momentum.test",
    password: DEMO_PASSWORD,
    initials: "PM",
    claims: {
      sub: "user-006",
      name: "Pieter van der Merwe",
      role: "adviser",
      policy_id: null,
      deceased_flag: false,
      // adviser_clients: user-006 -> user-001 (POL-1001), user-002 (POL-1002)
      scope: ["POL-1001", "POL-1002"],
    },
  },
  {
    email: "claims@momentum.test",
    password: DEMO_PASSWORD,
    initials: "NK",
    claims: {
      sub: "user-007",
      name: "Naledi Khumalo",
      role: "claims_assessor",
      policy_id: null,
      deceased_flag: false,
      // POL-1002 is the policy with a claim in progress.
      scope: ["POL-1002"],
    },
  },
  {
    email: "service@momentum.test",
    password: DEMO_PASSWORD,
    initials: "AP",
    claims: {
      sub: "user-008",
      name: "Ayesha Patel",
      role: "service_agent",
      policy_id: null,
      // Broad by necessity: a service agent must be able to help whoever
      // rings. Accountability comes from auditing actor plus subject on every
      // access, not from a short authorisation list.
      scope: ["*"],
      deceased_flag: false,
    },
  },
];

const BY_EMAIL = new Map(USERS.map((user) => [user.email.toLowerCase(), user]));
const BY_SUB = new Map(USERS.map((user) => [user.claims.sub, user]));

/** Constant-time comparison, so a wrong password leaks no timing hint. */
function secureEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // signal, so pad both to the longer length and compare the real lengths
  // afterwards.
  const size = Math.max(left.length, right.length);
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

/**
 * Verify credentials and return the user, or null.
 *
 * Deliberately returns the same null for an unknown email and a wrong
 * password: telling an attacker which of the two they got right hands them a
 * list of valid accounts. The route turns this into one generic message.
 */
export function authenticate(
  email: unknown,
  password: unknown
): DirectoryUser | null {
  if (typeof email !== "string" || typeof password !== "string") return null;

  const user = BY_EMAIL.get(email.trim().toLowerCase());

  if (!user) {
    // Still do the work, so a missing account is not measurably faster to
    // reject than a wrong password.
    secureEquals(password, "no-such-account-placeholder-value");
    return null;
  }

  return secureEquals(password, user.password) ? user : null;
}

/** Look up by `sub`, for minting a token from an existing session. */
export function findUserBySub(sub: string): DirectoryUser | null {
  return BY_SUB.get(sub) ?? null;
}
