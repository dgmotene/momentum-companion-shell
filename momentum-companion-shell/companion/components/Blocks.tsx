"use client";

// The message renderer.
//
// A reply is a list of typed blocks, not a string. That choice is what makes
// the compliance rules structural instead of aspirational.
//
// Consider the alternative. If the backend returned prose and the model had
// been told "always say this is an estimate", then the day the model phrases
// it differently, the safeguard is gone and nothing in the system notices. By
// making every amount a `value` block with a mandatory `classification`, the
// qualifier is attached by this file, from human-written copy in the contract,
// after the model has finished speaking. A model cannot phrase away a React
// prop.
//
// The same reasoning covers refusals, risk levels, checklists and SLAs: the
// backend states what a thing IS, and the renderer decides how it must look.

import {
  VALUE_CLASS_LABEL,
  VALUE_CLASS_NOTE,
  type Block,
  type ChecklistItem,
  type ValueClass,
} from "@shared/contract";

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "text":
      return <Paragraphs text={block.text} />;

    case "list":
      return block.ordered ? (
        <ol className="my-2 ml-5 list-decimal space-y-1 text-[13.5px] leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      ) : (
        <ul className="my-2 ml-5 list-disc space-y-1 text-[13.5px] leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );

    // Where the answer came from. Quiet by design: it should reassure without
    // making a plain answer feel like a legal document.
    case "citation":
      return (
        <p className="mt-2 text-[12px] italic text-ink-faint">
          From your policy&rsquo;s {block.section}
          {block.source ? ` · ${block.source}` : ""}
        </p>
      );

    case "checks":
      return (
        <ul className="my-2 space-y-1 text-[13px]">
          {block.items.map((item, i) => (
            <li
              key={i}
              className={item.ok ? "text-green-text" : "text-amber-text"}
            >
              <span aria-hidden="true">{item.ok ? "✅" : "⚠️"}</span>{" "}
              {item.label}
              <span className="sr-only">
                {item.ok ? " (verified)" : " (needs attention)"}
              </span>
            </li>
          ))}
        </ul>
      );

    // Before/after for a change awaiting confirmation. Showing the old value
    // struck through is how a user catches a mistake before it is committed.
    case "diff":
      return (
        <dl className="my-2.5 divide-y divide-line rounded-btn border border-line bg-canvas px-3 py-1">
          {block.rows.map((row, i) => (
            <div key={i} className="py-2">
              <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-[13px]">
                <span className="text-ink-faint line-through">{row.from}</span>
                <span aria-hidden="true" className="mx-2 text-ink-faint">
                  &rarr;
                </span>
                <strong className="text-teal-dark">{row.to}</strong>
              </dd>
            </div>
          ))}
        </dl>
      );

    case "value":
      return (
        <ValueBadge
          label={block.label}
          amount={block.amount}
          classification={block.classification}
          conditions={block.conditions}
          compareTo={block.compareTo}
        />
      );

    case "risk":
      return (
        <p className="my-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
              block.level === "low"
                ? "bg-green-tint text-green-text"
                : "bg-amber-tint text-amber-text"
            }`}
          >
            {block.level === "low" ? "Low risk" : "Needs a person"}
          </span>
          {block.note && (
            <span className="ml-2 text-[13px] text-ink-soft">{block.note}</span>
          )}
        </p>
      );

    case "checklist":
      return <Checklist title={block.title} items={block.items} />;

    case "stepper":
      return (
        <ol className="my-3 flex flex-wrap gap-x-1 gap-y-2">
          {block.steps.map((step, i) => (
            <li key={i} className="flex min-w-[84px] flex-1 flex-col gap-1.5">
              <span
                aria-hidden="true"
                className={`h-1.5 rounded-full ${
                  step.state === "done"
                    ? "bg-teal"
                    : step.state === "active"
                      ? "bg-teal/40"
                      : "bg-line"
                }`}
              />
              <span
                className={`text-[11.5px] ${
                  step.state === "todo"
                    ? "text-ink-faint"
                    : "font-semibold text-ink-soft"
                }`}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      );

    // An indicative timeline. Permitted by the Scope Change brief, but it
    // must never read as a promise, and never as a guarantee of approval.
    case "sla":
      return (
        <p className="my-2.5 flex items-start gap-2 rounded-btn bg-teal-tint px-3 py-2.5 text-[13px] leading-relaxed text-ink-soft">
          <span aria-hidden="true">🕐</span>
          <span>
            {block.text}
            <span className="mt-1 block text-[11.5px] text-ink-faint">
              An indicative processing time, not a commitment to a date or to
              any particular outcome.
            </span>
          </span>
        </p>
      );

    case "reference":
      return (
        <p className="my-2 text-[13px] text-ink-soft">
          {block.label}{" "}
          <strong className="font-semibold text-ink">{block.value}</strong>
        </p>
      );

    case "suggestions":
      return null; // rendered outside the bubble; see SuggestionChips

    // Only what the backend chose to say. This used to carry a teal "Connect
    // me to a person" that was a span, not a button: the one thing a user
    // reaches for at the moment they are refused, and it did nothing. The
    // handover is now a real journey, and the bubble's own outcome label
    // already announces it, so there is nothing left to draw unless the
    // backend supplies a wait time.
    case "escalation":
      if (!block.waitHint) return null;
      return (
        <p className="my-2 rounded-btn border border-line bg-canvas px-3 py-2 text-[12.5px] text-ink-soft">
          {block.waitHint}
        </p>
      );

    default:
      return null;
  }
}

/** Preserve intentional paragraph breaks without allowing arbitrary HTML. */
function Paragraphs({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  if (paragraphs.length <= 1) {
    return <p className="text-[13.5px] leading-relaxed">{text}</p>;
  }
  return (
    <>
      {paragraphs.map((paragraph, i) => (
        <p key={i} className={`text-[13.5px] leading-relaxed ${i ? "mt-2" : ""}`}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// The value badge: the Scope Change brief made visual.
//
// Its job is to keep three things which look alike from reading alike:
//
//   recorded             a real contractual amount     -> stated plainly
//   illustrative         an estimate                   -> always qualified
//   potentially_payable  conditional on requirements   -> conditions named
//   confirmed            assessed and decided          -> only ever from the
//                                                        backend's decision
//                                                        record
//
// The wording comes from VALUE_CLASS_NOTE in the contract, not from the model
// and not from this file, so it is identical everywhere an amount appears.
// ---------------------------------------------------------------------------

const VALUE_STYLES: Record<
  ValueClass,
  { wrap: string; badge: string; amount: string }
> = {
  recorded: {
    wrap: "border-line bg-canvas",
    badge: "bg-line text-ink-soft",
    amount: "text-ink",
  },
  illustrative: {
    wrap: "border-amber-border bg-amber-tint",
    badge: "bg-amber text-white",
    amount: "text-amber-text",
  },
  potentially_payable: {
    wrap: "border-amber-border bg-amber-tint",
    badge: "bg-amber-text text-white",
    amount: "text-amber-text",
  },
  confirmed: {
    wrap: "border-green bg-green-tint",
    badge: "bg-green text-white",
    amount: "text-green-text",
  },
};

export function ValueBadge({
  label,
  amount,
  classification,
  conditions,
  compareTo,
}: {
  label: string;
  amount: string;
  classification: ValueClass;
  conditions?: string[];
  compareTo?: { label: string; amount: string };
}) {
  const style = VALUE_STYLES[classification];
  const note = VALUE_CLASS_NOTE[classification];

  return (
    <div className={`my-2.5 rounded-btn border px-3.5 py-3 ${style.wrap}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
          {label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${style.badge}`}
        >
          {VALUE_CLASS_LABEL[classification]}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
        <span className={`text-[21px] font-bold ${style.amount}`}>{amount}</span>
        {compareTo && (
          <span className="text-[12px] text-ink-faint">
            {compareTo.label} {compareTo.amount}
          </span>
        )}
      </div>

      {/* Named conditions rather than a vague hedge. "Subject to terms" tells
          a user nothing; "we still need the specialist report" tells them what
          to do next. */}
      {conditions && conditions.length > 0 && (
        <ul className="mt-2 ml-4 list-disc space-y-0.5 text-[12px] leading-relaxed text-ink-soft">
          {conditions.map((condition, i) => (
            <li key={i}>{condition}</li>
          ))}
        </ul>
      )}

      {note && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">{note}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Claims checklist
//
// Order is presentational only: the backend accepts documents in any order,
// and the copy says so, because being told "step 3 of 6" when you cannot face
// step 3 today is exactly the wrong pressure to apply to a grieving person.
// ---------------------------------------------------------------------------

const CHECKLIST_ICON: Record<
  ChecklistItem["state"],
  { glyph: string; className: string; label: string }
> = {
  received: {
    glyph: "✓",
    className: "bg-green text-white",
    label: "received",
  },
  on_file: {
    glyph: "✓",
    className: "bg-teal text-white",
    label: "already on file",
  },
  next: {
    glyph: "→",
    className: "bg-teal-tint text-teal-dark ring-1 ring-teal",
    label: "suggested next",
  },
  outstanding: {
    glyph: "",
    className: "border border-line bg-surface",
    label: "outstanding",
  },
};

export function Checklist({
  title,
  items,
}: {
  title?: string;
  items: ChecklistItem[];
}) {
  const done = items.filter(
    (item) => item.state === "received" || item.state === "on_file"
  ).length;

  return (
    <section className="my-3 rounded-btn border border-line bg-surface p-3">
      <h3 className="text-[12.5px] font-semibold text-ink">
        {title ?? "Required documents"}
        <span className="ml-1.5 font-normal text-ink-faint">
          &middot; any order is fine
        </span>
      </h3>
      <p className="mt-0.5 text-[11.5px] text-ink-faint">
        {done} of {items.length} so far, whenever you&rsquo;re ready
      </p>

      <ul className="mt-2.5 space-y-2">
        {items.map((item) => {
          const icon = CHECKLIST_ICON[item.state];
          return (
            <li key={item.id} className="flex items-start gap-2.5">
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${icon.className}`}
              >
                {icon.glyph}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[12.5px] font-semibold ${
                    item.state === "outstanding" ? "text-ink-soft" : "text-ink"
                  }`}
                >
                  {item.label}
                  <span className="sr-only"> ({icon.label})</span>
                </span>
                {item.detail && (
                  <span className="block text-[11.5px] leading-snug text-ink-faint">
                    {item.detail}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Suggestion chips, rendered under the bubble rather than inside it. */
export function SuggestionChips({
  chips,
  onPick,
}: {
  chips: string[];
  onPick: (chip: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onPick(chip)}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition hover:border-teal hover:text-teal-dark"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

export function extractSuggestions(blocks: Block[]): string[] {
  return blocks.flatMap((block) =>
    block.kind === "suggestions" ? block.chips : []
  );
}
