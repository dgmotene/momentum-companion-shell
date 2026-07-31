// Mock policy data for the host portal.
//
// The host portal is a stand-in for Momentum's real member portal, so this
// stands in for the policy admin system it would read from. It exists to give
// the companion something real-looking to sit beside, and to give the What-If
// Explorer real starting numbers.
//
// Benefit names and structure follow the Myriad technical guide so the
// grounded answers and the portal agree with each other: a user should not
// see "Death Benefit" on the page and hear a different vocabulary in the chat.
//
// Amounts here are RECORDED values: contractual figures on the policy. They
// are not payout figures. Myriad guide p442 is explicit that claims are
// assessed on merit, may be repudiated, follow a payment waterfall through
// cessionary and beneficiary for proceeds, and have any outstanding debt
// deducted first. That is why every amount that reaches the chat carries a
// ValueClass, and why nothing in this file is ever labelled "confirmed".

export interface Benefit {
  /** Matches a section heading in the Myriad guide. */
  name: string;
  /** Recorded contractual amount, pre-formatted for display. */
  amount: string;
  /** "Lump sum", "Monthly income", etc. */
  shape: string;
}

export interface Policy {
  id: string;
  productName: string;
  status: "Active" | "Paid-up" | "Lapsed";
  /** Masked for display, the way a portal would. */
  masked: string;
  policyholderName: string;
  lifeInsuredName: string;
  monthlyPremium: number;
  premiumDueDay: string;
  sumAssured: number;
  waitingPeriodMonths: number;
  /** Set once Momentum has verified the policyholder's death. */
  deceased: boolean;
  benefits: Benefit[];
  /**
   * Requirements a staff user would want at a glance. Drives the adviser's
   * and assessor's "what is still outstanding" view.
   */
  outstanding: string[];
}

// Mirrors the `policies`, `policy_benefits` and `policy_beneficiaries` rows in
// db/seed.sql. Those figures are chosen so the SUBMISSION.md worked example
// lands exactly: POL-1001 at R500 000 / R300 per month means R400 000 with a
// 6-month wait estimates to R216, and R200 000 hits the R200 floor. Changing
// these numbers breaks that demo, so they follow the seed rather than the
// other way round.
export const POLICIES: Record<string, Policy> = {
  "POL-1001": {
    id: "POL-1001",
    productName: "Myriad Life Cover",
    status: "Active",
    masked: "#POL-***001",
    policyholderName: "Thandi Mokoena",
    // Different people: Lindiwe is the life insured, Thandi owns the policy.
    lifeInsuredName: "Lindiwe Mokoena",
    monthlyPremium: 300,
    premiumDueDay: "3rd of each month",
    sumAssured: 500000,
    waitingPeriodMonths: 0,
    deceased: false,
    benefits: [
      { name: "Death Benefit", amount: "R 500 000", shape: "Lump sum" },
      { name: "Funeral Benefit", amount: "R 50 000", shape: "Lump sum" },
      {
        name: "Complete Critical Illness Benefit",
        amount: "R 200 000",
        shape: "Lump sum",
      },
    ],
    outstanding: [],
  },

  // The bereaved case. The policyholder's death is verified, which is what
  // unlocks Sipho's restricted access and marks the death certificate as
  // already on file in the claims checklist. Seed status is `claim_pending`
  // with one death claim awaiting documents.
  "POL-1002": {
    id: "POL-1002",
    productName: "Myriad Life Cover",
    status: "Active",
    masked: "#POL-***002",
    policyholderName: "Nomsa Dlamini",
    lifeInsuredName: "Nomsa Dlamini",
    monthlyPremium: 450,
    premiumDueDay: "1st of each month",
    sumAssured: 750000,
    waitingPeriodMonths: 0,
    deceased: true,
    benefits: [
      { name: "Death Benefit", amount: "R 750 000", shape: "Lump sum" },
      { name: "Funeral Benefit", amount: "R 50 000", shape: "Lump sum" },
    ],
    outstanding: ["Relationship proof", "Claimant ID document", "Banking details"],
  },
};

export function getPolicy(id: string | null | undefined): Policy | null {
  if (!id) return null;
  return POLICIES[id] ?? null;
}

/** South African rand, no cents, thin spaces the way the wireframe shows. */
export function formatRand(amount: number): string {
  return `R ${Math.round(amount).toLocaleString("en-ZA").replace(/,/g, " ")}`;
}

// ---------------------------------------------------------------------------
// What-If
//
// The formula is the brief's, not the guide's: the Myriad guide contains no
// premium rate tables, so there is nothing to ground a real calculation in.
// Labelled as a simulation everywhere it surfaces, for that reason.
//
// This runs here only to drive the Explorer's sliders responsively. It is NOT
// the authority: when the user asks Lumina about a figure, the backend
// recomputes it from verified policy data. A number the browser produced is
// never allowed to become a number the assistant asserts.
// ---------------------------------------------------------------------------

export const WAITING_PERIOD_FACTORS: Record<number, number> = {
  0: 1,
  3: 0.95,
  6: 0.9,
  12: 0.82,
  24: 0.72,
};

export const PREMIUM_FLOOR = 200;

/** Nearest documented waiting period, since sliders move continuously. */
export function nearestWaitingPeriod(months: number): number {
  const options = Object.keys(WAITING_PERIOD_FACTORS).map(Number);
  return options.reduce((best, option) =>
    Math.abs(option - months) < Math.abs(best - months) ? option : best
  );
}

export interface WhatIfResult {
  premium: number;
  /** True when the R200 floor set the answer rather than the formula. */
  flooredAt: boolean;
  rawPremium: number;
  factor: number;
  waitingMonths: number;
}

/** new = max(200, current x (requested / current_sum) x factor) */
export function simulatePremium(
  policy: Policy,
  requestedSum: number,
  requestedWaitingMonths: number
): WhatIfResult {
  const waitingMonths = nearestWaitingPeriod(requestedWaitingMonths);
  const factor = WAITING_PERIOD_FACTORS[waitingMonths] ?? 1;
  const raw =
    policy.monthlyPremium * (requestedSum / policy.sumAssured) * factor;
  return {
    premium: Math.max(PREMIUM_FLOOR, raw),
    flooredAt: raw < PREMIUM_FLOOR,
    rawPremium: raw,
    factor,
    waitingMonths,
  };
}
