// Reaching a person.
//
// Ten different replies offer to connect the user with someone, so the offer
// has to be answerable. Detected in code rather than by the classifier: it is
// the one capability every role holds, including a caller we refuse everything
// else to, and a refused caller must not need a gateway call to reach help.

const ASKS_FOR_A_PERSON =
  /\b(speak|talk|chat|connect|put me|transfer|escalate|refer)\b[^.?!]{0,30}\b(person|human|someone|consultant|agent|adviser|advisor|representative|operator)\b/i;

const NAMES_A_PERSON_ONLY = /^\s*(a\s+)?(real\s+)?(person|human|consultant|agent)\s*[.!?]?\s*$/i;

export function wantsAPerson(message) {
  return ASKS_FOR_A_PERSON.test(message) || NAMES_A_PERSON_ONLY.test(message);
}

export function handoffReference(sessionId) {
  return `HO-${String(sessionId).replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}
