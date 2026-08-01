// Document lists verified against the Myriad technical guide ("Payment of a
// claim", printed p.2 per benefit part) via the RAG corpus, 2026-08-01.
// Timelines are deliberately indicative: the Scope Change forbids promising
// approval, amounts, or payment dates.
const BASE_DOCUMENTS = [
  "POPIA Consent form (CLAIM026)",
  "Proof of banking details in the claimant's name (not older than three months, on bank letterhead or bank-stamped)",
];

const TIMELINE_DISCLAIMER =
  " Approval and any payment are only confirmed after validation and claims assessment.";

const CLAIM_TYPES = {
  death: {
    label: "Death claim",
    extraDocuments: [
      "Death claim form (CLAIM001E)",
      "Deceased insured life's identity document (or unabridged birth certificate if younger than 18)",
      "Death certificate (BI-5)",
      "Notification of death (DHA-1663), from the doctor who declared the death",
      "Unnatural death claim form (CLAIM003E), only if death was due to unnatural causes",
    ],
    timeline:
      "Where the Instant Cash feature applies, a portion may be paid within one working day of submission; the remaining benefit is paid once the claim has been assessed and admitted.",
  },
  funeral: {
    label: "Funeral claim",
    extraDocuments: [
      "Funeral claim form (CLAIM009)",
      "Deceased insured life's identity document (or unabridged birth certificate if younger than 18)",
      "Death certificate (BI-5)",
      "Notification of death or stillbirth (DHA-1663)",
      "Unnatural death claim form (CLAIM003E), only if death was due to unnatural causes",
    ],
    timeline:
      "Payment is typically made within one working day of the claim event once all required documents are received, unless a no-claims period applies.",
  },
  income: {
    label: "Income protection claim",
    extraDocuments: [
      "Income disability and impairment benefit claim form (CLAIM007)",
      "Insured life's identity document",
      "All relevant diagnostic tests and reports",
      "Medical certificate from a specialist confirming the diagnosis and exact sick-leave dates",
      "Proof of income for the 12 months before diagnosis (salary slips, tax returns, bank statements)",
      "Radiology, operation, hospital, or accident reports where applicable",
    ],
    timeline:
      "The claim is paid once it has been assessed and admitted; assessment time depends on the medical and income evidence provided.",
  },
  disability: {
    label: "Disability claim",
    extraDocuments: [
      "Lump sum disability and functional impairment benefits form (CLAIM004)",
      "Insured life's identity document",
      "All relevant diagnostic tests and reports",
      "Comprehensive medical report from the treating specialist, not older than six months (history, diagnosis, treatment plan, response)",
      "Operation report or official accident report, where applicable",
    ],
    timeline:
      "The claim is paid once it has been assessed and admitted; assessment time depends on the medical evidence provided.",
  },
  critical_illness: {
    label: "Critical illness claim",
    extraDocuments: [
      "Critical illness claim form: CLAIM008 (cardiac, cancer, nervous system) or CLAIM015 (general)",
      "Insured life's identity document",
      "All relevant diagnostic tests and reports",
      "Confidential medical report from the treating specialist with full diagnosis, prognosis, and treatment plan (a GP report is not accepted)",
      "For child cover: unabridged birth certificate, or proof of guardianship if the guardian is not a biological parent",
    ],
    timeline:
      "The claim is paid once it has been assessed and admitted; assessment time depends on the medical evidence provided.",
  },
};

export const CLAIM_TYPE_KEYS = Object.keys(CLAIM_TYPES);

export function claimChecklist(claimType, { deceasedFlag = false } = {}) {
  const definition = CLAIM_TYPES[claimType];
  if (!definition) return null;
  const documents = [...definition.extraDocuments, ...BASE_DOCUMENTS].map(
    (documentName) => ({
      name: documentName,
      // The flag means Momentum already verified the death certificate.
      onFile: deceasedFlag && documentName.startsWith("Death certificate"),
    })
  );
  return {
    claimType,
    label: definition.label,
    documents,
    timeline: definition.timeline + TIMELINE_DISCLAIMER,
  };
}
