// Fake login options, matching the rows in db/seed.sql. On a beneficiary's
// token, deceased_flag refers to their linked policyholder.
export type PersonaClaims = {
  sub: string;
  role: string;
  policy_id: string | null;
  deceased_flag: boolean;
};

export type Persona = PersonaClaims & { label: string };

export const PERSONAS: Record<string, Persona> = {
  policyholder: {
    label: "Thandi Mokoena (policyholder)",
    sub: "user-001",
    role: "policyholder",
    policy_id: "POL-1001",
    deceased_flag: false,
  },
  beneficiary: {
    label: "Sipho Dlamini (beneficiary, claim opened)",
    sub: "user-003",
    role: "beneficiary",
    policy_id: "POL-1002",
    deceased_flag: true,
  },
  beneficiary_pending: {
    label: "Bongani Mokoena (beneficiary, no access yet)",
    sub: "user-004",
    role: "beneficiary",
    policy_id: "POL-1001",
    deceased_flag: false,
  },
  life_insured: {
    label: "Lindiwe Mokoena (life insured)",
    sub: "user-005",
    role: "life_insured",
    policy_id: "POL-1001",
    deceased_flag: false,
  },
  adviser: {
    label: "Pieter van der Merwe (financial adviser)",
    sub: "user-006",
    role: "adviser",
    policy_id: null,
    deceased_flag: false,
  },
  claims_assessor: {
    label: "Naledi Khumalo (claims assessor)",
    sub: "user-007",
    role: "claims_assessor",
    policy_id: null,
    deceased_flag: false,
  },
  service_agent: {
    label: "Ayesha Patel (service agent)",
    sub: "user-008",
    role: "service_agent",
    policy_id: null,
    deceased_flag: false,
  },
};
