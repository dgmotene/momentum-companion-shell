"use client";

// The What-If Explorer.
//
// This lives on the HOST page, not inside the chat, and that is the whole
// point of the screen. Sliders are a better tool than a conversation for
// hunting a number, but they are a terrible tool for explaining one. So the
// portal owns the controls and Lumina, docked beside them, explains what the
// user just did.
//
// The figures here are illustrative, and labelled as such in three places:
// the banner, the result card, and the estimate note. Per the Scope Change
// brief an estimate may never be presented as a confirmed amount, and an
// unqualified number on screen is exactly how that rule gets broken quietly.
//
// The browser's arithmetic is for responsiveness only. When the user asks
// Lumina about a figure, the backend recomputes it from verified policy data;
// a number this file produced never becomes a number the assistant asserts.

import { useEffect, useMemo, useState } from "react";
import { VALUE_CLASS_NOTE, type PageContext } from "@shared/contract";
import {
  formatRand,
  simulatePremium,
  WAITING_PERIOD_FACTORS,
  type Policy,
} from "@/lib/policies";

const WAITING_OPTIONS = Object.keys(WAITING_PERIOD_FACTORS)
  .map(Number)
  .sort((a, b) => a - b);

export function WhatIfExplorer({
  policy,
  onContextChange,
  onAskLumina,
}: {
  policy: Policy;
  /** Publishes the current scenario to the companion as an untrusted hint. */
  onContextChange: (context: PageContext) => void;
  onAskLumina: () => void;
}) {
  const [sumAssured, setSumAssured] = useState(policy.sumAssured);
  const [waitingMonths, setWaitingMonths] = useState(
    policy.waitingPeriodMonths
  );

  const result = useMemo(
    () => simulatePremium(policy, sumAssured, waitingMonths),
    [policy, sumAssured, waitingMonths]
  );

  const delta = result.premium - policy.monthlyPremium;

  // Tell the companion what is on screen, debounced so dragging a slider does
  // not fire a message per pixel.
  useEffect(() => {
    const timer = setTimeout(() => {
      onContextChange({
        page: "what_if_explorer",
        summary:
          `The user is exploring changes to ${policy.id}. Current cover ` +
          `${formatRand(policy.sumAssured)} at ${formatRand(policy.monthlyPremium)} per month ` +
          `with a ${policy.waitingPeriodMonths}-month waiting period. They are ` +
          `looking at ${formatRand(sumAssured)} cover with a ${result.waitingMonths}-month ` +
          `waiting period, which estimates to ${formatRand(result.premium)} per month.`,
        fields: {
          policy_id: policy.id,
          current_sum_assured: policy.sumAssured,
          current_premium: policy.monthlyPremium,
          current_waiting_months: policy.waitingPeriodMonths,
          requested_sum_assured: sumAssured,
          requested_waiting_months: result.waitingMonths,
          estimated_premium: Math.round(result.premium),
          floored: result.flooredAt ? "yes" : "no",
        },
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [policy, sumAssured, waitingMonths, result, onContextChange]);

  return (
    <section>
      <h1 className="text-[20px] font-semibold text-brand-ink sm:text-[21px]">What-If Explorer</h1>
      <p className="mt-1 text-[12px] text-brand-inkSoft sm:text-[13px]">
        {policy.masked} &middot; explore changes to your cover
      </p>

      <div
        role="note"
        className="mt-3 max-w-3xl rounded-[12px] border border-brand-amber/60 bg-brand-amberTint px-3 py-2 text-[11px] font-semibold text-brand-amberText sm:mt-4 sm:rounded-lg sm:px-4 sm:py-2.5 sm:text-[12.5px]"
      >
        &#9888; {VALUE_CLASS_NOTE.illustrative}
      </div>

      <div className="mt-4 grid gap-3 max-w-3xl sm:mt-5 sm:gap-5 lg:grid-cols-2">
        {/* Current: recorded values, safe to state plainly. */}
        <div className="rounded-[12px] border border-brand-border bg-brand-surface p-3.5 shadow-sm sm:rounded-lg sm:p-5">
          <h2 className="text-[12.5px] font-semibold text-brand-ink sm:text-[14px]">Current</h2>
          <dl className="mt-2 divide-y divide-brand-border sm:mt-3">
            <Row label="Sum assured" value={formatRand(policy.sumAssured)} />
            <Row
              label="Monthly premium"
              value={formatRand(policy.monthlyPremium)}
            />
            <Row
              label="Waiting period"
              value={`${policy.waitingPeriodMonths} months`}
            />
          </dl>
          <p className="mt-2 border-t border-brand-border pt-2 text-[10.5px] text-brand-inkFaint sm:mt-3 sm:pt-3 sm:text-[11.5px]">
            These are the values recorded on your policy.
          </p>
        </div>

        {/* Adjust: illustrative values, qualified everywhere they appear. */}
        <div className="rounded-[12px] border border-brand-border bg-brand-surface p-3.5 shadow-sm sm:rounded-lg sm:p-5">
          <h2 className="text-[12.5px] font-semibold text-brand-ink sm:text-[14px]">Adjust</h2>

          <div className="mt-3">
            <label
              htmlFor="wi-sum"
              className="flex items-baseline justify-between text-[11px] font-semibold text-brand-inkSoft sm:text-[12.5px]"
            >
              <span>New sum assured</span>
              <span className="text-brand-ink">{formatRand(sumAssured)}</span>
            </label>
            <input
              id="wi-sum"
              type="range"
              min={200000}
              max={1500000}
              step={10000}
              value={sumAssured}
              onChange={(event) => setSumAssured(Number(event.target.value))}
              className="mt-1.5 w-full accent-brand-teal sm:mt-2"
            />
          </div>

          <div className="mt-3 sm:mt-4">
            <label
              htmlFor="wi-wait"
              className="flex items-baseline justify-between text-[11px] font-semibold text-brand-inkSoft sm:text-[12.5px]"
            >
              <span>Waiting period</span>
              <span className="text-brand-ink">{result.waitingMonths} months</span>
            </label>
            <input
              id="wi-wait"
              type="range"
              min={0}
              max={24}
              step={1}
              value={waitingMonths}
              onChange={(event) => setWaitingMonths(Number(event.target.value))}
              aria-describedby="wi-wait-help"
              className="mt-1.5 w-full accent-brand-teal sm:mt-2"
            />
            <p id="wi-wait-help" className="mt-1 text-[10px] text-brand-inkFaint sm:text-[11.5px]">
              Snaps to the documented periods:{" "}
              {WAITING_OPTIONS.join(", ")} months.
            </p>
          </div>

          <div className="mt-3 rounded-lg bg-brand-blueTint px-3 py-2.5 sm:mt-5 sm:rounded-lg sm:px-4 sm:py-3.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-inkFaint sm:text-[11px]">
              Estimated new premium
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-[18px] font-bold text-brand-tealDark sm:text-[22px]">
                {formatRand(result.premium)}
              </span>
              {Math.abs(delta) >= 1 && (
                <span
                  className={`text-[11px] font-semibold ${
                    delta > 0 ? "text-brand-amberText" : "text-brand-green"
                  } sm:text-[12px]`}
                >
                  ({delta > 0 ? "+" : "−"}
                  {formatRand(Math.abs(delta))})
                </span>
              )}
            </div>

            {/* The R200 floor is real, so say so rather than showing a number
                the formula did not actually produce. */}
            {result.flooredAt && (
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-brand-amberText sm:mt-2 sm:text-[12px]">
                The calculation works out to {formatRand(result.rawPremium)}, but
                the minimum premium on this product is{" "}
                {formatRand(200)}, so that is what is shown.
              </p>
            )}

            <p className="mt-1.5 text-[10px] leading-relaxed text-brand-inkSoft sm:mt-2 sm:text-[11.5px]">
              {VALUE_CLASS_NOTE.illustrative}
            </p>
          </div>

          <button
            type="button"
            onClick={onAskLumina}
            className="mt-3 w-full rounded-lg bg-brand-teal px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-brand-tealDark sm:mt-4 sm:px-4 sm:py-2.5 sm:text-[13.5px] sm:rounded-lg"
          >
            Ask Lumina about this scenario
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-lg text-[11px] leading-relaxed text-brand-inkFaint sm:mt-5 sm:text-[12px]">
        The sliders are the host page. Lumina sits beside them and can explain
        the trade-off you are looking at, because the portal tells it what is on
        screen. It re-derives the numbers from your policy before saying
        anything about them.
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 sm:gap-4 sm:py-2.5">
      <dt className="text-[12px] text-brand-inkSoft sm:text-[13px]">{label}</dt>
      <dd className="text-[12.5px] font-semibold text-brand-ink sm:text-[13.5px]">{value}</dd>
    </div>
  );
}
