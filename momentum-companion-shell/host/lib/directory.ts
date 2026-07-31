// Client-safe portal reference data.
//
// Everything here is allowed to reach the browser. Credentials and the
// authoritative claim set live in lib/users.ts, which is server-only.
//
// Kept in step with db/seed.sql by hand. The database is authoritative: the
// companion backend re-reads every profile from Postgres, so a label here that
// disagrees with a row there is a display bug waiting to confuse someone.

import type { Role } from "@shared/contract";

/**
 * Friendly labels for the seeded policies. Only two policies exist.
 */
export const POLICY_LABELS: Record<string, string> = {
  "POL-1001": "Thandi Mokoena · Myriad Life Cover",
  "POL-1002": "Late Nomsa Dlamini · Myriad Life Cover (claim in progress)",
};

/** The policies a staff user may choose between, from their token scope. */
export function subjectsFor(scope: string[]): string[] {
  if (scope.includes("*")) return Object.keys(POLICY_LABELS);
  return scope;
}

export interface DemoAccount {
  email: string;
  password: string;
  name: string
  role: Role;
  initials: string;
  blurb: string;
  tone: "full" | "restricted" | "none" | "staff";
}

/**
 * Sign-in hints, ordered as a walkthrough: full access, the partial cases, the
 * one refused everything, then the three staff roles.
 *
 * Published deliberately. Judges need a way in, and the point being
 * demonstrated is not that the passwords are secret but that the *server*
 * decides who you are once you present one.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "member@momentum.test",
    password: "password123",
    name: "Thandi Mokoena",
    role: "policyholder",
    initials: "TM",
    blurb: "Owns POL-1001. Full servicing.",
    tone: "full",
  },
  {
    email: "insured@momentum.test",
    password: "password123",
    name: "Lindiwe Mokoena",
    role: "life_insured",
    initials: "LM",
    blurb: "Life insured on POL-1001, which Thandi owns.",
    tone: "restricted",
  },
  {
    email: "beneficiary@momentum.test",
    password: "password123",
    name: "Sipho Dlamini",
    role: "beneficiary",
    initials: "SD",
    blurb: "His mother's death is verified, so claims are open.",
    tone: "restricted",
  },
  {
    email: "pending@momentum.test",
    password: "password123",
    name: "Bongani Mokoena",
    role: "beneficiary",
    initials: "BM",
    blurb: "Named on a living policyholder's policy. Reaches nothing.",
    tone: "none",
  },
  {
    email: "adviser@momentum.test",
    password: "password123",
    name: "Pieter van der Merwe",
    role: "adviser",
    initials: "PM",
    blurb: "Adviser for two clients only.",
    tone: "staff",
  },
  {
    email: "claims@momentum.test",
    password: "password123",
    name: "Naledi Khumalo",
    role: "claims_assessor",
    initials: "NK",
    blurb: "Assessor, scoped to the claim in progress.",
    tone: "staff",
  },
  {
    email: "service@momentum.test",
    password: "password123",
    name: "Ayesha Patel",
    role: "service_agent",
    initials: "AP",
    blurb: "Serves any caller. Every access audited.",
    tone: "staff",
  },
];
