// The last check before model prose reaches a user.
//
// The system prompt already states the compliance rules, but a prompt is a
// request and this is the enforcement: contract.ts makes the point that words
// can be phrased away by a model where a required prop cannot.

const OUTCOME_PROMISES = [
  { pattern: /\byour claim will be (approved|paid|settled|admitted)\b/i, breach: "promises a claim outcome" },
  { pattern: /\byou will be paid\b/i, breach: "promises a payment" },
  { pattern: /\byou will receive (a payout|the payout|R\s?[\d.,]+)/i, breach: "promises a payment" },
  { pattern: /\b(we|momentum) guarantee\b/i, breach: "guarantees an individual outcome" },
  { pattern: /\byou are guaranteed\b/i, breach: "guarantees an individual outcome" },
  { pattern: /\byour claim (is|will be) (successful|certain)\b/i, breach: "states an outcome as certain" },
];

const RAND_AMOUNT = /R\s?\d[\d\s.,]*/;

// Structure in this product comes from block kinds, not from markdown inside a
// text block, and the renderer prints text verbatim to avoid arbitrary HTML.
// Left alone, a model's "## Heading" and "**bold**" reach the user as literal
// characters.
export function stripMarkdown(text) {
  return text
    // The model writes em dashes, curly quotes and ellipses that nothing else
    // in the product uses. Normalised here rather than asked for in the
    // prompt, because a prompt is a request and this is not negotiable.
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/(?<![*\w])\*(?!\s)([^*\n]+?)(?<!\s)\*(?![*\w])/g, "$1")
    // The renderer collapses single newlines, so a stripped bullet would run
    // into the next item. Each becomes its own paragraph instead.
    .replace(/^\s*[-*+]\s+(.*)$/gm, "$1\n")
    .replace(/`{1,3}([^`]*)`{1,3}/gs, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findOutcomePromise(text) {
  return OUTCOME_PROMISES.find((rule) => rule.pattern.test(text))?.breach ?? null;
}

export function mentionsAmount(text) {
  return RAND_AMOUNT.test(text);
}

/**
 * @returns {{ safe: boolean, text: string, breach: string|null, needsClassification: boolean }}
 */
export function guardCompletion(rawText) {
  const text = stripMarkdown(String(rawText ?? ""));
  const breach = findOutcomePromise(text);
  return {
    safe: breach === null,
    text,
    breach,
    needsClassification: breach === null && mentionsAmount(text),
  };
}
