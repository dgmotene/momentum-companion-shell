"use client";

// Lumina: the chat panel.
//
// Runs on its own origin inside the host's iframe. It has no login of its own
// and never will: identity arrives from the parent portal, and every request
// it makes is re-verified by the backend before anything happens.
//
// What this component is allowed to decide: what to draw. Which chips to
// offer, whether to greet someone by name, whether to lead with a claim or
// with servicing. What it is not allowed to decide: anything. Every refusal
// on screen was made by the backend.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ROLE_LABEL,
  capabilitiesFor,
  isStaffRole,
  type Block,
} from "@shared/contract";
import { useHostBridge } from "@/lib/host-bridge";
import { sendChat, verifyToken, type VerifyResult } from "@/lib/api";
import { MOCK_NOTICE } from "@/lib/mock-journeys";
import { Message, type ChatTurn } from "@/components/Message";

export default function Companion() {
  const bridge = useHostBridge();
  const { token, claims, pageContext, rejectedOrigin } = bridge;

  const [verification, setVerification] = useState<VerifyResult | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const feedRef = useRef<HTMLOListElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const turnCounter = useRef(0);

  const capabilities = claims ? capabilitiesFor(claims) : [];
  const staff = claims ? isStaffRole(claims.role) : false;
  const actingFor = pageContext?.acting_for ?? null;
  const firstName = claims?.name.split(" ")[0] ?? "there";
  const bereaved = claims?.role === "beneficiary" && claims.deceased_flag;

  // Verify with the backend as soon as identity arrives. The local decode was
  // only ever good enough to draw with.
  useEffect(() => {
    if (!token) {
      setVerification(null);
      return;
    }
    let cancelled = false;
    void verifyToken(token).then((result) => {
      if (!cancelled) setVerification(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Reset the conversation when identity changes (persona switch, sign-out).
  useEffect(() => {
    setTurns([]);
    setSessionId(null);
  }, [claims?.sub]);

  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const greeting = useMemo<Block[]>(() => {
    if (!claims) return [];
    if (capabilities.length === 0) {
      return [
        {
          kind: "text",
          text: `Hi ${firstName}. There isn't any policy information available to you at the moment, so there's not much I can help with here. If you think that's wrong, our team can help on 0860 66 26 66.`,
        },
      ];
    }
    // The opening of a bereavement conversation is fixed, human-written text.
    // It is the single line most likely to do harm if a model improvises it.
    // No chips: nudging a grieving person toward pre-baked buttons reads as
    // impatience. The invitation is to say whatever they need to say.
    if (bereaved) {
      return [
        {
          kind: "text",
          text: `Hi ${firstName}. I'm so sorry for your loss.\n\nWhenever you feel ready, I can help you start a claim or answer questions about the policy. There's no rush, and you can stop at any point and pick it up later. Just tell me what feels most useful right now.`,
        },
      ];
    }
    if (staff) {
      return [
        {
          kind: "text",
          text: actingFor
            ? `Hi ${firstName}. I can help you with ${actingFor}. Talk to me in your own words; everything you ask is recorded against your name.`
            : `Hi ${firstName}. I can answer product and policy questions from the Myriad guide, and you can open a client to work on a specific policy. Talk to me in your own words; everything you ask is recorded against your name.`,
        },
      ];
    }
    return [
      {
        kind: "text",
        text: `Hi ${firstName}, I'm Lumina. Tell me what's on your mind. I can answer questions about your policy, help with changes, or walk you through a claim, and there's no wrong way to ask.`,
      },
    ];
  }, [claims, capabilities.length, bereaved, staff, firstName, actingFor]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || !token || !claims || sending) return;

      const userTurn: ChatTurn = {
        id: `u${++turnCounter.current}`,
        author: "user",
        blocks: [{ kind: "text", text: message }],
      };
      const placeholder: ChatTurn = {
        id: `l${++turnCounter.current}`,
        author: "lumina",
        blocks: [],
        streaming: true,
      };

      setTurns((current) => [...current, userTurn, placeholder]);
      setDraft("");
      setSending(true);

      const { response, mocked } = await sendChat(
        token,
        {
          message,
          session_id: sessionId,
          acting_for: staff ? actingFor : null,
          page_context: pageContext,
        },
        claims
      );

      if (response.session_id) setSessionId(response.session_id);
      if (mocked) setUsingFixtures(true);

      setTurns((current) =>
        current.map((turn) =>
          turn.id === placeholder.id
            ? {
                ...turn,
                blocks: response.blocks,
                outcome: response.outcome,
                reference: response.reference ?? null,
                citations: response.citations ?? [],
                streaming: false,
                mocked,
              }
            : turn
        )
      );
      setSending(false);
    },
    [token, claims, sending, sessionId, staff, actingFor, pageContext]
  );

  const toggleExpand = useCallback(() => {
    if (expanded) {
      bridge.restore();
      setExpanded(false);
    } else {
      bridge.expand();
      setExpanded(true);
    }
  }, [expanded, bridge]);

  // Waiting for the handshake. Not an error state: the panel simply has no
  // identity yet, which is exactly right before someone signs in.
  if (!claims) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
        <span
          aria-hidden="true"
          className="h-9 w-9 animate-pulse rounded-full bg-gradient-to-br from-teal-light to-teal"
        />
        <p className="text-[13px] text-ink-soft">
          Waiting for the portal to confirm who you are.
        </p>
        {rejectedOrigin && (
          <p className="max-w-xs rounded-btn bg-amber-tint px-3 py-2 text-[11.5px] text-amber-text">
            Ignored a message from an untrusted origin: {rejectedOrigin}
          </p>
        )}
      </main>
    );
  }

  const canChat = capabilities.length > 0;

  return (
    <main className="flex h-screen flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <header className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <span
          aria-hidden="true"
          className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-teal-light to-teal"
        />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold leading-tight text-ink">
            Lumina{" "}
            <span className="font-normal text-ink-faint">&middot; AI Companion</span>
          </p>
          <p className="flex items-center gap-1.5 text-[11px] leading-tight text-ink-faint">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                verification?.verified ? "bg-green" : "bg-amber"
              }`}
            />
            {verification === null
              ? "Verifying…"
              : verification.verified
                ? `Verified · ${ROLE_LABEL[claims.role]}`
                : verification.offline
                  ? "Backend offline"
                  : "Not verified"}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggleExpand}
            title={expanded ? "Back to panel" : "Open full screen"}
            className="rounded-btn px-2 py-1 text-[11.5px] font-semibold text-teal-dark hover:bg-teal-tint"
          >
            {expanded ? "⤡" : "⤢"}
            <span className="sr-only">
              {expanded ? "Restore panel size" : "Expand to full screen"}
            </span>
          </button>
          <button
            type="button"
            onClick={bridge.minimize}
            title="Minimize"
            className="rounded-btn px-2 py-1 text-[15px] leading-none text-ink-faint hover:bg-canvas"
          >
            –<span className="sr-only">Minimize Lumina</span>
          </button>
        </div>
      </header>

      {/* Who this conversation is about, when it is not the signed-in user. */}
      {staff && (
        <p className="border-b border-teal/20 bg-teal-tint px-3.5 py-1.5 text-[11.5px] font-semibold text-teal-dark">
          {actingFor
            ? `Acting for ${actingFor} · recorded against your name`
            : "No client selected in the portal yet"}
        </p>
      )}

      {verification && !verification.verified && (
        <p
          role="alert"
          className="border-b border-amber-border bg-amber-tint px-3.5 py-1.5 text-[11.5px] text-amber-text"
        >
          {verification.error ?? "The backend could not verify this session."}
        </p>
      )}

      {usingFixtures && (
        <p className="border-b border-line bg-canvas px-3.5 py-1.5 text-[11px] text-ink-faint">
          {MOCK_NOTICE}
        </p>
      )}

      <ol
        ref={feedRef}
        className="flex-1 space-y-3.5 overflow-y-auto px-3.5 py-4"
        aria-live="polite"
        aria-label="Conversation"
      >
        <Message
          turn={{ id: "greeting", author: "lumina", blocks: greeting }}
          onPickSuggestion={send}
        />
        {turns.map((turn) => (
          <Message key={turn.id} turn={turn} onPickSuggestion={send} />
        ))}
      </ol>


      {canChat ? (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
            className="flex items-center gap-2 border-t border-line px-3 py-2.5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx"
              hidden
              // No upload happens in this build: the file never leaves the
              // page. The button's only job is to give the user a natural way
              // to mention what they have, in their own words, without
              // scripting a canned message on their behalf.
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const tag = `[Attached: ${file.name}] `;
                setDraft((current) =>
                  current ? `${current.trimEnd()} ${tag}` : tag
                );
                event.target.value = "";
                // Return focus to the input so the user carries on typing.
                document.getElementById("lumina-input")?.focus();
              }}
            />
            <button
              type="button"
              title="Attach a document"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-[15px] text-ink-faint hover:border-teal hover:text-teal"
              onClick={() => fileInputRef.current?.click()}
            >
              +<span className="sr-only">Attach a document</span>
            </button>
            <label htmlFor="lumina-input" className="sr-only">
              Message Lumina
            </label>
            <input
              id="lumina-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={
                bereaved
                  ? "Ask a question, or say \u201chelp me with the claim\u201d…"
                  : "Talk to Lumina in your own words\u2026"
              }
              // Deliberately not disabled while a reply is in flight: a
              // disabled input cannot hold focus, so the caret was lost on
              // every turn. send() already ignores a second submit.
              className="min-w-0 flex-1 rounded-full border border-line bg-canvas px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-faint focus:border-teal"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-[13px] text-white transition hover:bg-teal-dark disabled:opacity-40"
            >
              ➤<span className="sr-only">Send</span>
            </button>
          </form>

          
        </>
      ) : (
        <p className="border-t border-line bg-canvas px-3.5 py-3 text-[12px] leading-relaxed text-ink-faint">
          There is nothing available for this profile to discuss right now.
        </p>
      )}
    </main>
  );
}
