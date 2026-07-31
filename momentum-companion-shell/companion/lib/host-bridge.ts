"use client";

// The companion's side of the iframe boundary.
//
// Mirror image of the host's loader. Its whole job is to receive identity from
// the parent window without ever trusting the parent window more than it has
// to, and to ask the parent for the resizing it cannot do itself.
//
// Three rules, all of them here rather than scattered through components:
//
//   1. Every inbound message's origin is checked against an allowlist before
//      the payload is touched at all.
//   2. Every outbound message names the parent's exact origin. Never "*".
//   3. The companion announces itself first and waits to be given identity.
//      It never asks for a token by guessing at the parent's API, because
//      that would mean the child deciding when it gets credentials.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMPANION_TO_HOST,
  HOST_TO_COMPANION,
  TOKEN_RENEW_MARGIN_SECONDS,
  type IdentityClaims,
  type PageContext,
} from "@shared/contract";
import { ALLOWED_PARENT_ORIGINS } from "./origins";
import { decodeJwtUnverified, secondsUntilExpiry } from "./decode";

export interface HostBridge {
  /** Raw token, forwarded verbatim to the backend on every request. */
  token: string | null;
  /**
   * Claims read WITHOUT verification, for drawing the UI only. See decode.ts.
   * The backend's verdict is the one that counts.
   */
  claims: IdentityClaims | null;
  /** Full payload, for the demo's claims panel. */
  rawClaims: Record<string, unknown> | null;
  /** Latest hint from the host about what is on screen. */
  pageContext: PageContext | null;
  /** Set when a message arrived from an origin not on the allowlist. */
  rejectedOrigin: string | null;
  /** True once the handshake has completed and identity has arrived. */
  ready: boolean;
  expand: () => void;
  restore: () => void;
  minimize: () => void;
}

export function useHostBridge(): HostBridge {
  const [token, setToken] = useState<string | null>(null);
  const [claims, setClaims] = useState<IdentityClaims | null>(null);
  const [rawClaims, setRawClaims] = useState<Record<string, unknown> | null>(
    null
  );
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const [rejectedOrigin, setRejectedOrigin] = useState<string | null>(null);

  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The origin that actually gave us identity, for targeted replies. */
  const parentOrigin = useRef<string | null>(null);

  const postToParent = useCallback((message: unknown) => {
    if (window.parent === window) return;
    const target = parentOrigin.current;
    if (target) {
      window.parent.postMessage(message, target);
      return;
    }
    // Before the handshake we do not yet know which allowlisted origin is
    // actually our parent, so announce to each in turn. The browser silently
    // drops the ones that do not match, and every candidate is one we already
    // trust, so nothing leaks to a third party.
    for (const origin of ALLOWED_PARENT_ORIGINS) {
      window.parent.postMessage(message, origin);
    }
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // Origin first, before looking at the payload.
      if (!ALLOWED_PARENT_ORIGINS.includes(event.origin)) {
        setRejectedOrigin(event.origin);
        return;
      }

      const data = event.data as { type?: unknown } | null;

      switch (data?.type) {
        case HOST_TO_COMPANION.IDENTITY_TOKEN: {
          const incoming = (data as { token?: unknown }).token;
          if (typeof incoming !== "string") return;

          parentOrigin.current = event.origin;
          const decoded = decodeJwtUnverified(incoming);
          setToken(incoming);
          setClaims(decoded?.claims ?? null);
          setRawClaims(decoded?.raw ?? null);

          // Ask for a fresh token shortly before this one dies. The backend
          // holds the conversation, so the swap is invisible: a claim in
          // progress never loses its place, and a role change or a newly set
          // deceased flag is picked up within one token life.
          if (renewTimer.current) clearTimeout(renewTimer.current);
          const remaining = secondsUntilExpiry(decoded?.exp ?? null);
          if (remaining !== null) {
            const lead = Math.max(remaining - TOKEN_RENEW_MARGIN_SECONDS, 15);
            renewTimer.current = setTimeout(() => {
              postToParent({ type: COMPANION_TO_HOST.TOKEN_EXPIRING });
            }, lead * 1000);
          }
          break;
        }

        case HOST_TO_COMPANION.PAGE_CONTEXT: {
          const context = (data as { context?: unknown }).context;
          if (context && typeof context === "object") {
            setPageContext(context as PageContext);
          }
          break;
        }

        case HOST_TO_COMPANION.SESSION_ENDED: {
          if (renewTimer.current) clearTimeout(renewTimer.current);
          setToken(null);
          setClaims(null);
          setRawClaims(null);
          setPageContext(null);
          break;
        }

        default:
          break;
      }
    }

    window.addEventListener("message", onMessage);

    // Announce readiness on mount, and therefore on every reload too. The host
    // replies with the token. Announcing first rather than waiting to be
    // pushed removes the race where the host posts into a frame whose listener
    // is not attached yet.
    postToParent({ type: COMPANION_TO_HOST.READY });

    return () => {
      window.removeEventListener("message", onMessage);
      if (renewTimer.current) clearTimeout(renewTimer.current);
    };
  }, [postToParent]);

  const expand = useCallback(
    () => postToParent({ type: COMPANION_TO_HOST.EXPAND }),
    [postToParent]
  );
  const restore = useCallback(
    () => postToParent({ type: COMPANION_TO_HOST.RESTORE }),
    [postToParent]
  );
  const minimize = useCallback(
    () => postToParent({ type: COMPANION_TO_HOST.MINIMIZE }),
    [postToParent]
  );

  return {
    token,
    claims,
    rawClaims,
    pageContext,
    rejectedOrigin,
    ready: token !== null,
    expand,
    restore,
    minimize,
  };
}
