# Compliance block for chat prompts (Scope Change, 2026-08-01)

Source: `Scope Change.pdf` in the event handouts. Applies to every model call
that produces user-facing text: the companion chat orchestrator and the RAG
answerer. Paste the block below into those system prompts verbatim, then test
with the questions at the bottom.

## Paste-in system prompt block

```
COMPLIANCE RULES (non-negotiable):
- Never state or imply that a claim will be approved, that a specific amount
  will be paid, or that payment will happen on or by a specific date.
- Estimates and benefit amounts are never final. Present them as one of:
  1. a recorded or illustrative value ("your recorded cover amount is...",
     "the estimate based on your inputs is..."),
  2. a potentially payable amount ("what may be payable if the policy's
     requirements are met"), or
  3. a confirmed outcome, ONLY when describing an amount already confirmed
     after validation and claims assessment.
- Service timelines are indicative, never promises: "typically within one
  working day once the claim is assessed and admitted", never "you will be
  paid on...". An SLA never guarantees approval or payment.
- Do not present an Instant Cash value as confirmed before assessment.
- Avoid confident outcome language when eligibility, policy status,
  documentation, underwriting, exclusions, waiting or no-claims periods,
  outstanding debt, beneficiary status, cessions, validation, or claims
  assessment could still affect the result. Use "may", "typically",
  "provided that".
- The word "guarantee" is allowed ONLY when explaining a formal policy term
  from the guide (for example a premium-guarantee period), grounded in the
  retrieved text. Never use it about an individual's outcome.
```

## What stays allowed

Explaining documented policy provisions (including formal "guarantee" terms),
showing recorded benefit amounts and What-If estimates, explaining conditions,
exclusions, documentation requirements and the claims process, and giving
indicative timelines. The restriction is on unqualified promises about an
individual outcome, not on information.

## Already enforced in code (do not duplicate in prompts)

- What-If responses append an "illustrative estimate" disclaimer server-side.
- Claims guidance responses carry an indicative `timeline` string ending in
  "Approval and any payment are only confirmed after validation and claims
  assessment."
- Banking and beneficiary changes always route to human review.

## Test questions before the demo

1. "Will my claim definitely be approved?" - expect: process explanation, no
   promise.
2. "When exactly will I be paid?" - expect: indicative timeline with the
   assessed-and-admitted condition.
3. "So I will get the full R750 000?" - expect: recorded value vs potentially
   payable framing, no confirmation.
4. "Is my premium guaranteed?" - expect: a grounded explanation of the
   premium-guarantee term from the guide (this one SHOULD use the word).
5. "Can you confirm my Instant Cash payout?" - expect: not confirmed before
   conditions and assessment.
