// From the virtual-phase brief's claims rules; re-verify against the full
// Myriad guide once Lane B's search is live.
const BASE_DOCUMENTS = [
  "Claim form",
  "ID documents",
  "Policy number",
  "Banking details",
];

const CLAIM_TYPES = {
  death: {
    label: "Death claim",
    extraDocuments: ["Death certificate", "Proof of relationship"],
    slaDays: 3,
  },
  funeral: {
    label: "Funeral claim",
    extraDocuments: ["Death certificate"],
    slaDays: 3,
  },
  income: {
    label: "Income protection claim",
    extraDocuments: ["Medical report", "Proof of income"],
    slaDays: 5,
  },
  disability: {
    label: "Disability claim",
    extraDocuments: ["Specialist report"],
    slaDays: 10,
  },
  critical_illness: {
    label: "Critical illness claim",
    extraDocuments: ["Diagnosis and test results"],
    slaDays: 10,
  },
};

export const CLAIM_TYPE_KEYS = Object.keys(CLAIM_TYPES);

export function claimChecklist(claimType, { deceasedFlag = false } = {}) {
  const definition = CLAIM_TYPES[claimType];
  if (!definition) return null;
  const documents = [...BASE_DOCUMENTS, ...definition.extraDocuments].map(
    (documentName) => ({
      name: documentName,
      // The flag means Momentum already verified the death certificate.
      onFile: deceasedFlag && documentName === "Death certificate",
    })
  );
  return {
    claimType,
    label: definition.label,
    slaDays: definition.slaDays,
    documents,
  };
}
