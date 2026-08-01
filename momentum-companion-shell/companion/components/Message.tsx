"use client";

// A single turn in the conversation.
//
// The bubble's appearance comes from the backend's `outcome` enum, never from
// reading the words. That matters: a refusal phrased kindly is still a
// refusal, and a change that was only queued must never look like one that
// was applied. If the styling were inferred from prose, a gentler model would
// quietly turn an amber "we've flagged this for a person" into something that
// reads as done.

import type { Block, Citation, Outcome } from "@shared/contract";
import { Blocks, SuggestionChips, extractSuggestions } from "./Blocks";

export interface ChatTurn {
  id: string;
  author: "user" | "lumina";
  blocks: Block[];
  outcome?: Outcome;
  reference?: string | null;
  /** Retrieved by the backend and kept on the turn, but not shown: retrieval
   *  is noisy enough that a wrong source reads worse than no source. */
  citations?: Citation[];
  /** True while the reply is still arriving. */
  streaming?: boolean;
  /** True when this reply came from demo fixtures. */
  mocked?: boolean;
}

const OUTCOME_STYLE: Partial<Record<Outcome, string>> = {
  applied: "border-green bg-green-tint",
  pending_review: "border-amber-border bg-amber-tint",
  refused: "border-line bg-canvas",
  no_grounding: "border-line bg-canvas",
  escalated: "border-line bg-canvas",
  error: "border-amber-border bg-amber-tint",
};

/** A short, plain label so the state of a turn is never ambiguous. */
const OUTCOME_LABEL: Partial<Record<Outcome, string>> = {
  applied: "Applied",
  pending_review: "Waiting on a person",
  refused: "Not available on this policy",
  no_grounding: "Not in the documents",
  escalated: "Handing over to a person",
};

export function Message({
  turn,
  onPickSuggestion,
}: {
  turn: ChatTurn;
  onPickSuggestion: (text: string) => void;
}) {
  if (turn.author === "user") {
    return (
      <li className="flex justify-end">
        <div className="max-w-[85%] rounded-bubble rounded-br-md bg-teal px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
          {turn.blocks.map((block, i) =>
            block.kind === "text" ? <span key={i}>{block.text}</span> : null
          )}
        </div>
      </li>
    );
  }

  const suggestions = extractSuggestions(turn.blocks);
  const shell = turn.outcome ? OUTCOME_STYLE[turn.outcome] : undefined;
  const label = turn.outcome ? OUTCOME_LABEL[turn.outcome] : undefined;

  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden="true"
        className="mt-1 h-6 w-6 shrink-0 rounded-full bg-gradient-to-br from-teal-light to-teal"
      />
      <div className="min-w-0 max-w-[92%]">
        <div
          className={`rounded-bubble rounded-bl-md border px-3.5 py-2.5 text-ink ${
            shell ?? "border-line bg-surface"
          }`}
        >
          {label && (
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-faint">
              {label}
            </p>
          )}

          <Blocks blocks={turn.blocks} />

          {turn.reference && (
            <p className="mt-2 text-[12px] text-ink-soft">
              Reference{" "}
              <strong className="font-semibold text-ink">{turn.reference}</strong>
            </p>
          )}

          {turn.streaming && (
            <span
              aria-label="Lumina is typing"
              className="mt-1 inline-flex gap-1"
            >
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-faint"
                  style={{ animationDelay: `${dot * 140}ms` }}
                />
              ))}
            </span>
          )}
        </div>

        {/* Fixtures are labelled on the turn itself, not just once at the top
            of the panel. Anyone scrolling back should be able to tell which
            replies were real. */}
        {turn.mocked && (
          <p className="mt-1 text-[10.5px] italic text-ink-faint">
            demo fixture, not a grounded answer
          </p>
        )}

        {suggestions.length > 0 && !turn.streaming && (
          <SuggestionChips chips={suggestions} onPick={onPickSuggestion} />
        )}
      </div>
    </li>
  );
}
