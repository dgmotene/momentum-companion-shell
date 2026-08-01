// Fixture replies, used only until the real orchestrator is wired.
//
// Why this exists: the frontend and the backend are being built in parallel,
// and a chat UI with nothing to say cannot be developed, reviewed or demoed.
// These fixtures let the whole browser side be finished and judged on its own
// merits, then swapped for the real /api/chat by flipping one flag.
//
// Two rules kept faithfully, so that what is built against the mock still
// works against the real thing:
//
//   1. Every reply is a real ChatResponse from the contract. No shortcuts, no
//      extra fields. If it renders here it renders in production.
//
//   2. The mock refuses what the role cannot do, and says a refusal came from
//      the server. The real refusal IS server-side; pretending otherwise here
//      would let the UI grow a dependency on being told "yes" by mistake.
//
// The policy content is quoted from the Myriad technical guide (February 2024)
// so the wording a judge reads is the wording the real retrieval will find.

import {
  NO_GROUNDING_RESPONSE,
  capabilitiesFor,
  type Block,
  type Capability,
  type ChatRequest,
  type ChatResponse,
  type IdentityClaims,
} from "@shared/contract";

export const MOCK_NOTICE =
  "Demo fixtures: the gateway and retrieval are not wired to this build yet.";

type Intent =
  | "qa_death_benefit"
  | "qa_funeral"
  | "qa_cooling_off"
  | "qa_premium_guarantee"
  | "qa_missed_payment"
  | "qa_payout_amount"
  | "what_if"
  | "address_update"
  | "province_change"
  | "banking_change"
  | "claim_start"
  | "claim_documents"
  | "claims_assessment"
  | "outstanding"
  | "product_compare"
  | "escalate"
  | "out_of_scope"
  | "unknown";

/**
 * Keyword matching stands in for call 1 of the real orchestrator, which asks
 * a small model to pick from a fixed intent list. Same shape of answer, same
 * default: anything unrecognised falls through to a safe response rather than
 * a guess.
 */
function classify(message: string): Intent {
  const text = message.toLowerCase();

  if (/other insurer|compare.*(insurer|company)|better deal|competitor/.test(text))
    return "out_of_scope";
  if (/human|person|consultant|advisor|adviser|agent|speak to/.test(text))
    return "escalate";

  if (/how much.*(pay|payout|get)|final amount|will i receive|guarantee.*pay/.test(text))
    return "qa_payout_amount";
  if (/death benefit|life cover|main cover|what does.*cover/.test(text))
    return "qa_death_benefit";
  if (/funeral/.test(text)) return "qa_funeral";
  if (/cooling.?off|change my mind|cancel.*(30|31) ?days/.test(text))
    return "qa_cooling_off";
  if (/premium guarantee|guarantee(d)? premium|premium increase/.test(text))
    return "qa_premium_guarantee";
  if (/miss(ed)? a payment|arrears|lapse|reinstat/.test(text))
    return "qa_missed_payment";

  if (/what if|simulate|increase.*cover|reduce.*cover|premium.*if|calculator/.test(text))
    return "what_if";

  if (/province|relocat|moving to (another|a different) province/.test(text))
    return "province_change";
  if (/address|moved|new home|relocate/.test(text)) return "address_update";
  if (/bank|account number|debit order|branch code/.test(text))
    return "banking_change";

  if (/exclusion|repudiat|assess|evidence|clause/.test(text))
    return "claims_assessment";
  if (/document|paperwork|what do i need|checklist/.test(text))
    return "claim_documents";
  if (/claim/.test(text)) return "claim_start";

  if (/outstanding|still needed|missing/.test(text)) return "outstanding";
  if (/which product|compare|disability benefit.*product/.test(text))
    return "product_compare";

  return "unknown";
}

/** Which capability an intent needs. Null means everyone with any access. */
const INTENT_CAPABILITY: Record<Intent, Capability | null> = {
  qa_death_benefit: "policy_qa",
  qa_funeral: "policy_qa",
  qa_cooling_off: "policy_qa",
  qa_premium_guarantee: "policy_qa",
  qa_missed_payment: "policy_qa",
  qa_payout_amount: "policy_qa",
  what_if: "what_if",
  address_update: "self_service_update",
  province_change: "self_service_update",
  banking_change: "banking_change",
  claim_start: "claims_guidance",
  claim_documents: "claims_guidance",
  claims_assessment: "claims_assessment",
  outstanding: "outstanding_requirements",
  product_compare: "product_compare",
  escalate: "human_handoff",
  out_of_scope: "policy_qa",
  unknown: null,
};

function needs(claims: IdentityClaims, capability: Capability): boolean {
  return capabilitiesFor(claims).includes(capability);
}

let turn = 0;
const nextId = (prefix: string) =>
  `${prefix}-${(30500 + ++turn).toString().padStart(5, "0")}`;

export function mockChat(
  request: ChatRequest,
  claims: IdentityClaims
): ChatResponse {
  const sessionId = request.session_id ?? "mock-session-1";
  const intent = classify(request.message);
  const capability = INTENT_CAPABILITY[intent];
  const firstName = claims.name.split(" ")[0];

  const base = { session_id: sessionId, citations: [], audit_id: nextId("AUD") };

  // No capabilities at all: the deceased-flag gate.
  if (capabilitiesFor(claims).length === 0) {
    return {
      ...base,
      outcome: "refused",
      refusal_reason: "No policy access is available for this profile.",
      blocks: [
        {
          kind: "text",
          text:
            `Hi ${firstName}. I'm not able to discuss this policy at the moment. ` +
            `Being named on a policy doesn't give access to it while the ` +
            `policyholder is living.`,
        },
        {
          kind: "text",
          text: "If you think that's wrong, our team can help on 0860 66 26 66.",
        },
      ],
    };
  }

  // Role gate. In production this decision is the backend's, made after
  // verifying the token and before any action runs.
  if (capability && !needs(claims, capability)) {
    return refusal(base, intent, firstName);
  }

  switch (intent) {
    case "qa_death_benefit":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "Death Benefit / Claim amount", source: "Myriad guide p.36" },
        ],
        blocks: [
          {
            kind: "text",
            text:
              "The Death Benefit pays a lump sum when the insured life dies. On this policy the recorded benefit amount is:",
          },
          {
            kind: "value",
            label: "Death Benefit",
            amount: "R 500 000",
            classification: "recorded",
          },
          {
            kind: "text",
            text: "A few things the guide is specific about:",
          },
          {
            kind: "list",
            items: [
              "The benefit is paid as a single lump sum.",
              "Payment follows an order: any cessionary first, then the beneficiary for proceeds, then the policyholder or the deceased estate.",
              "Any outstanding debt on the policy is deducted before payment.",
            ],
          },
        ],
      };

    case "qa_funeral":
      return {
        ...base,
        outcome: "answered",
        citations: [{ section: "Funeral Benefit", source: "Myriad guide p.54" }],
        blocks: [
          {
            kind: "text",
            text: "The Funeral Benefit is separate from the main Death Benefit and is paid as an immediate lump sum.",
          },
          {
            kind: "value",
            label: "Funeral Benefit",
            amount: "R 50 000",
            classification: "recorded",
          },
        ],
      };

    case "qa_cooling_off":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "General information / Cooling-off", source: "Myriad guide p.4" },
        ],
        blocks: [
          {
            kind: "text",
            text: "There is a cooling-off period after the policy starts, during which it can be cancelled and premiums already paid are refunded, provided no benefit has been claimed.",
          },
        ],
      };

    // The Scope Change brief's nuance, demonstrated: "premium guarantee" is a
    // real documented provision and may be explained. What may not happen is
    // promising an individual outcome.
    case "qa_premium_guarantee":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "General information / Premium guarantees", source: "Myriad guide p.8" },
        ],
        blocks: [
          {
            kind: "text",
            text:
              "Your policy has a premium guarantee term. During that term Momentum will not increase the contract premium or decrease the benefit amounts.",
          },
          {
            kind: "text",
            text:
              "The length of the term is calculated from the premium and benefit amount chosen at the start. It is a defined provision in the policy, not an open-ended promise: once the term ends, premiums can be reviewed.",
          },
        ],
      };

    case "qa_missed_payment":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "General information / Premiums in arrears (Lapse)", source: "Myriad guide p.12" },
        ],
        blocks: [
          {
            kind: "text",
            text: "If premiums fall into arrears the policy can lapse, which means cover stops. A lapsed policy can be restarted through reinstatement, and reinstatement may require underwriting depending on how long it has been.",
          },
          {
            kind: "text",
            text: "If a payment is going to be late, it's much easier to sort out before the policy lapses. I can put you through to someone who can arrange that.",
          },
        ],
      };

    // The heart of the Scope Change requirement: asked point-blank for a
    // payout figure, distinguish recorded from potentially payable, and
    // refuse to confirm anything.
    case "qa_payout_amount":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "Claim requirements / Payment of a claim", source: "Myriad guide p.442" },
        ],
        blocks: [
          {
            kind: "text",
            text: "I can show you what's recorded on the policy, and explain what could be payable. I can't tell you the final amount, and I want to be straight with you about why.",
          },
          {
            kind: "value",
            label: "Benefit amount on record",
            amount: "R 750 000",
            classification: "recorded",
          },
          {
            kind: "value",
            label: "What may be payable",
            amount: "Up to R 750 000",
            classification: "potentially_payable",
            conditions: [
              "The claim is admitted after assessment. Claims are assessed on their merits and some are declined.",
              "Any cessionary on the policy is paid first, then the beneficiary for proceeds.",
              "Any outstanding debt on the policy is deducted before payment.",
              "All required documents have been received and validated.",
            ],
          },
          {
            kind: "text",
            text: "The confirmed amount is the one you'll be given in writing once assessment is complete. Anything I said before then would be a guess, and this is not something to guess about.",
          },
        ],
      };

    case "what_if": {
      const fields = request.page_context?.fields ?? {};
      const requested = Number(fields.requested_sum_assured ?? 650000);
      const estimated = Number(fields.estimated_premium ?? 1246);
      const currentPremium = Number(fields.current_premium ?? 1065);
      const waiting = Number(fields.requested_waiting_months ?? 6);

      return {
        ...base,
        outcome: "answered",
        workflow: {
          journey: "what_if",
          collected: {
            sum_assured: String(requested),
            waiting_months: String(waiting),
          },
          missing: [],
        },
        blocks: [
          {
            kind: "text",
            text: `Two things are moving there. Raising the cover to R ${requested.toLocaleString("en-ZA").replace(/,/g, " ")} is the bigger part of it. Shortening the waiting period to ${waiting} months adds a little more, because cover would start sooner after a claim event.`,
          },
          {
            kind: "value",
            label: "Estimated monthly premium",
            amount: `R ${estimated.toLocaleString("en-ZA").replace(/,/g, " ")}`,
            classification: "illustrative",
            compareTo: {
              label: "currently",
              amount: `R ${currentPremium.toLocaleString("en-ZA").replace(/,/g, " ")}`,
            },
          },
          {
            kind: "text",
            text: "A longer waiting period would bring that down again. If you land on something you like, I can set up a proper quote with a consultant.",
          },
        ],
      };
    }

    case "address_update":
      return {
        ...base,
        outcome: "applied",
        reference: nextId("UPD"),
        workflow: {
          journey: "address_update",
          collected: {
            street: "14 Oak Road",
            suburb: "Sandton",
            postal_code: "2196",
            province: "Gauteng",
          },
          missing: [],
        },
        blocks: [
          { kind: "text", text: "Thanks, checking that now." },
          {
            kind: "checks",
            items: [
              { label: "Street address complete", ok: true },
              { label: "Postal code is 4 digits", ok: true },
              { label: "Province unchanged: Gauteng", ok: true },
            ],
          },
          {
            kind: "diff",
            rows: [
              {
                label: "Residential address",
                from: "45 Church St, Gauteng, 2001",
                to: "14 Oak Road, Sandton, 2196",
              },
            ],
          },
          {
            kind: "risk",
            level: "low",
            note: "Your province stays the same, so I can apply this now.",
          },
          { kind: "text", text: "Done. You'll see it on your next statement." },
        ],
      };

    // High-risk contrast: validated, deliberately not applied.
    case "province_change":
      return {
        ...base,
        outcome: "pending_review",
        reference: nextId("UPD"),
        workflow: {
          journey: "address_update",
          collected: {
            street: "88 Marine Drive",
            suburb: "Durban",
            postal_code: "4001",
            province: "KwaZulu-Natal",
          },
          missing: ["human confirmation"],
        },
        blocks: [
          {
            kind: "checks",
            items: [
              { label: "Street address complete", ok: true },
              { label: "Postal code is 4 digits", ok: true },
            ],
          },
          {
            kind: "diff",
            rows: [
              {
                label: "Residential address",
                from: "45 Church St, Gauteng, 2001",
                to: "88 Marine Drive, KwaZulu-Natal, 4001",
              },
            ],
          },
          {
            kind: "risk",
            level: "high",
            note: "The province changes from Gauteng to KwaZulu-Natal.",
          },
          {
            kind: "text",
            text: "A province change can affect risk rating and premium, so I'm not applying this one myself. I've logged it and flagged it for our team to confirm. Nothing else is needed from you right now.",
          },
        ],
      };

    case "banking_change":
      return {
        ...base,
        outcome: "pending_review",
        reference: nextId("BNK"),
        blocks: [
          {
            kind: "risk",
            level: "high",
            note: "Banking details are never changed automatically.",
          },
          {
            kind: "text",
            text: "I can take the details and pass them to our team, who will confirm them with you directly before anything changes. That check is there to protect your money, so I won't shortcut it.",
          },
        ],
      };

    case "claim_start":
    case "claim_documents": {
      const bereaved = claims.role === "beneficiary" && claims.deceased_flag;
      const blocks: Block[] = [];

      if (bereaved) {
        // Fixed, human-written. Never improvised by a model.
        blocks.push({
          kind: "text",
          text: "I'm truly sorry for your loss. We can go at whatever pace suits you, and you can stop at any point and pick this up later.",
        });
      }

      blocks.push({
        kind: "checklist",
        title: "Death claim requirements",
        items: [
          {
            id: "claim_form",
            label: "Death claim form (CLAIM001E)",
            detail: "We can complete this together here",
            state: "next",
          },
          {
            id: "death_cert",
            label: "Death certificate (BI-5)",
            detail: bereaved
              ? "Already on file from the death notification, no need to resubmit"
              : "Certified copy",
            state: bereaved ? "on_file" : "outstanding",
          },
          {
            id: "deceased_id",
            label: "Deceased's identity document",
            state: "outstanding",
          },
          {
            id: "claimant_id",
            label: "Your identity document",
            detail: "As the claimant",
            state: "outstanding",
          },
          {
            id: "notification",
            label: "Notification of death (DHA-1663)",
            detail: "From the doctor who declared the death",
            state: "outstanding",
          },
          {
            id: "popia",
            label: "POPIA consent form (CLAIM026)",
            state: "outstanding",
          },
          {
            id: "banking",
            label: "Proof of banking details",
            detail: "On bank letterhead or stamped, not older than three months",
            state: "outstanding",
          },
        ],
      });

      blocks.push({
        kind: "sla",
        text: "Death and funeral claims are usually processed within 3 working days of everything being received.",
        days: 3,
      });

      blocks.push({
        kind: "text",
        text: "There's no order you have to do these in. Tell me what you have and I'll keep track of the rest.",
      });

      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "Claim requirements / Death claims", source: "Myriad guide p.443" },
        ],
        workflow: {
          journey: "claim",
          claim_type: "death",
          collected: bereaved ? { death_certificate: "on file" } : {},
          missing: [
            "claim form",
            "deceased ID",
            "claimant ID",
            "notification of death",
            "POPIA consent",
            "banking details",
          ],
          sla_days: 3,
        },
        blocks,
      };
    }

    case "claims_assessment":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "Claims / Introduction", source: "Myriad guide p.442" },
        ],
        blocks: [
          {
            kind: "text",
            text: "The guide lists the most common grounds for repudiation:",
          },
          {
            kind: "list",
            items: [
              "Nondisclosure of material information",
              "Misrepresentation of facts",
              "Failure to meet benefit definitions",
              "Benefits no longer in force",
              "The insured life is not covered for the claim event",
            ],
          },
          {
            kind: "text",
            text: "On this claim the specialist report is still outstanding, so the benefit definition can't be tested yet.",
          },
        ],
      };

    case "outstanding":
      return {
        ...base,
        outcome: "answered",
        blocks: [
          {
            kind: "checklist",
            title: "Outstanding on this policy",
            items: [
              {
                id: "spec",
                label: "Specialist report",
                detail: "Required for the disability claim in assessment",
                state: "next",
              },
              { id: "income", label: "Proof of income", state: "outstanding" },
            ],
          },
        ],
      };

    case "product_compare":
      return {
        ...base,
        outcome: "answered",
        citations: [
          { section: "Comprehensive disability Benefit", source: "Myriad guide p.68" },
          { section: "Own Occupation Disability Benefit", source: "Myriad guide p.75" },
        ],
        blocks: [
          {
            kind: "text",
            text: "Several Myriad benefits cover disability, and they differ in how disability is defined:",
          },
          {
            kind: "list",
            items: [
              "Comprehensive Disability Benefit",
              "Own Occupation Disability Benefit",
              "Comprehensive ADW Disability Benefit",
              "Functional Impairment Benefit",
              "Complete Income Protector, for income rather than a lump sum",
            ],
          },
        ],
      };

    case "escalate":
      return {
        ...base,
        outcome: "escalated",
        blocks: [
          {
            kind: "escalation",
            reason: "Of course. I'll connect you with a consultant who can pick this up with you directly.",
            waitHint: "about 2 min wait",
          },
        ],
      };

    // Retrieval found nothing above the threshold. In production the model is
    // never called at all in this case, so there is no chance of a guess.
    case "out_of_scope":
      return {
        ...base,
        outcome: "no_grounding",
        blocks: [{ kind: "text", text: NO_GROUNDING_RESPONSE }],
      };

    default:
      return {
        ...base,
        outcome: "answered",
        blocks: [
          {
            kind: "text",
            text: `I'm listening, ${firstName}. Tell me what you'd like to sort out and I'll take it from there — you can be as loose or as specific as you like.`,
          },
        ],
      };
  }
}

/**
 * Refusals are fixed, human-written text, and they explain the decision
 * without describing the machinery behind it. A user does not need to hear
 * about role matrices; they need to know where they stand and what they can
 * still do.
 */
function refusal(
  base: Pick<ChatResponse, "session_id" | "citations" | "audit_id">,
  intent: Intent,
  firstName: string
): ChatResponse {
  const messages: Partial<Record<Intent, string>> = {
    what_if:
      "I'm sorry, that's not something I'm able to work out on this policy. Premium and cover simulations sit with the policyholder's access. I can explain the cover that's in place, or help with the claim.",
    address_update:
      "I'm not able to change details on this policy. I can explain what's covered, or help you with the claim, and our team can handle any changes.",
    province_change:
      "I'm not able to change details on this policy. Our team can help with that directly.",
    banking_change:
      "I'm not able to change banking details on this policy. Our team handles that, and they'll confirm everything with you first.",
    claims_assessment:
      "Assessment notes and exclusions analysis aren't something I can go into on this policy. I can explain what the policy covers in general terms.",
    outstanding:
      "I can't list assessment requirements on this policy. I can explain what documents a claim usually needs.",
    product_compare:
      "I can't compare products from here, but a consultant would be glad to walk you through the options.",
  };

  return {
    ...base,
    outcome: "refused",
    refusal_reason: `Role is not permitted to perform: ${intent}`,
    blocks: [
      {
        kind: "text",
        text:
          messages[intent] ??
          `I'm not able to do that on this policy, ${firstName}. I can explain the cover that's in place, or put you through to someone who can help.`,
      },
      {
        kind: "suggestions",
        chips: ["What does the policy cover?", "Talk to a person"],
      },
    ],
  };
}
