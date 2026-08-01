const WAITING_PERIOD_FACTORS = { 0: 1, 3: 0.95, 6: 0.9, 12: 0.82, 24: 0.72 };
const MINIMUM_PREMIUM = 200;
const DISCLAIMER =
  "This is an illustrative estimate, not an offer or a confirmed premium. The final premium is only confirmed after validation and underwriting, and a consultant will confirm it before any change is made.";

export function estimatePremium({
  currentPremium,
  currentSum,
  requestedSum,
  waitingMonths,
}) {
  // An unspecified wait is not a zero-month wait. The factor only ever
  // discounts for accepting a longer wait, so with none chosen there is
  // nothing to discount and the premium scales on cover alone.
  const waitSpecified = waitingMonths !== null && waitingMonths !== undefined;
  const factor = waitSpecified ? WAITING_PERIOD_FACTORS[waitingMonths] : 1;
  if (factor === undefined) {
    return {
      error: `waiting period must be one of ${Object.keys(WAITING_PERIOD_FACTORS).join(", ")} months`,
    };
  }
  if (!Number.isFinite(requestedSum) || requestedSum <= 0) {
    return { error: "requested cover must be a positive amount" };
  }
  const rawPremium = currentPremium * (requestedSum / currentSum) * factor;
  const estimatedPremium = Math.max(MINIMUM_PREMIUM, rawPremium);
  return {
    currentSum,
    currentPremium,
    requestedSum,
    waitingMonths: waitSpecified ? waitingMonths : null,
    estimatedPremium: Math.round(estimatedPremium * 100) / 100,
    flooredAtMinimum: rawPremium < MINIMUM_PREMIUM,
    disclaimer: DISCLAIMER,
  };
}
