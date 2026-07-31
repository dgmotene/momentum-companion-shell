"use client";

// React wiring for the loader.
//
// The loader itself is framework-free (see companion-embed.ts). This hook is
// the thin Next.js-specific layer: it owns the embed's lifetime, mints identity
// tokens from the host's own API route, and keeps the token fresh so the user
// never sees an expiry.
//
// Minting takes no arguments. The token that comes back is for whoever the
// session cookie says is signed in, which the browser cannot influence.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  HOST_API,
  TOKEN_RENEW_MARGIN_SECONDS,
  type CompanionSurface,
  type PageContext,
} from "@shared/contract";
import { CompanionEmbed } from "./companion-embed";

const COMPANION_ORIGIN =
  process.env.NEXT_PUBLIC_COMPANION_ORIGIN ?? "http://localhost:3001";

export interface UseCompanionResult {
  surface: CompanionSurface;
  /** True once an identity token has been minted and handed over. */
  signedIn: boolean;
  open: () => void;
  minimize: () => void;
  sendPageContext: (context: PageContext) => void;
  /** Last error from the token endpoint, for the demo status line. */
  error: string | null;
  /** Counts quiet renewals, so the demo can show them happening. */
  renewals: number;
}

/**
 * @param active  whether a user is signed in right now.
 * @param enabled whether to embed at all.
 *
 * `enabled` is false for a user the portal has nothing for: a beneficiary
 * whose policyholder is alive holds no capabilities, so the portal does not
 * offer an assistant that could only refuse her. That is a product decision
 * about what to put on a page, not a security control. Were the iframe
 * embedded anyway and a token handed over, the backend would refuse every
 * request it made regardless.
 */
export function useCompanion(
  active: boolean,
  enabled: boolean = true
): UseCompanionResult {
  const embedRef = useRef<CompanionEmbed | null>(null);
  const renewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Read inside mintToken rather than closed over, so a sign-out mid-renewal
   *  cannot resurrect a token for the previous user. */
  const activeRef = useRef(active);
  activeRef.current = active;

  const [surface, setSurface] = useState<CompanionSurface>("pill");
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renewals, setRenewals] = useState(0);

  const clearRenewTimer = () => {
    if (renewTimer.current) {
      clearTimeout(renewTimer.current);
      renewTimer.current = null;
    }
  };

  /**
   * Ask the host to mint a token for the current session.
   *
   * No parameters: the server reads the httpOnly session cookie and answers
   * for that user. A 401 means the session has gone (expired, or signed out in
   * another tab), and the right response is to stop, not to retry.
   */
  const mintToken = useCallback(async (): Promise<string | null> => {
    if (!activeRef.current) return null;
    try {
      const res = await fetch(HOST_API.TOKEN, {
        method: "POST",
        credentials: "same-origin",
      });

      if (res.status === 401) {
        clearRenewTimer();
        setSignedIn(false);
        setError("The portal session has ended. Sign in again to continue.");
        return null;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          body?.error ??
            "Token endpoint failed. Run `npm run setup` to generate the keypair."
        );
        return null;
      }

      const { token, expiresIn } = (await res.json()) as {
        token: string;
        expiresIn: number;
      };
      setError(null);

      // Renew ahead of expiry rather than on failure. A turn already in flight
      // must never land on a dead token, and because the backend holds the
      // conversation, the swap is invisible: a claim in progress keeps its
      // place. Each renewal re-reads the directory server-side, so a role
      // change is never more than one token life stale.
      clearRenewTimer();
      const lead = Math.max(expiresIn - TOKEN_RENEW_MARGIN_SECONDS, 30);
      renewTimer.current = setTimeout(() => {
        setRenewals((count) => count + 1);
        void mintToken().then((fresh) => {
          if (fresh) embedRef.current?.sendToken(fresh);
        });
      }, lead * 1000);

      return token;
    } catch {
      setError("Could not reach the host token endpoint.");
      return null;
    }
  }, []);

  // Mount the embed for as long as the portal wants to offer it.
  useEffect(() => {
    if (!enabled) {
      setSurface("pill");
      setSignedIn(false);
      return;
    }
    const embed = new CompanionEmbed({
      companionOrigin: COMPANION_ORIGIN,
      mintToken,
      onSurfaceChange: setSurface,
    });
    embedRef.current = embed;
    embed.mount();
    return () => {
      clearRenewTimer();
      embed.destroy();
      embedRef.current = null;
    };
  }, [mintToken, enabled]);

  // Hand over identity on sign-in; clear it on sign-out.
  useEffect(() => {
    const embed = embedRef.current;
    if (!embed) return;

    if (!active) {
      clearRenewTimer();
      setSignedIn(false);
      setRenewals(0);
      embed.endSession();
      return;
    }

    let cancelled = false;
    void mintToken().then((token) => {
      if (cancelled || !token) return;
      embed.sendToken(token);
      setSignedIn(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active, enabled, mintToken]);

  const open = useCallback(() => embedRef.current?.setSurface("panel"), []);
  const minimize = useCallback(() => embedRef.current?.setSurface("pill"), []);
  const sendPageContext = useCallback(
    (context: PageContext) => embedRef.current?.sendPageContext(context),
    []
  );

  return { surface, signedIn, open, minimize, sendPageContext, error, renewals };
}
