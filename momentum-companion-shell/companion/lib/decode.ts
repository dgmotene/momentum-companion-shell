// Reading claims out of a token WITHOUT verifying it.
//
// This is display and affordance only, and the naming is deliberately blunt
// so nobody reaches for it by accident.
//
// The companion needs to know the user's role to decide what to put on screen:
// which chips to show, whether to render a client picker, whether to open at
// all. It cannot verify a signature to find that out, because verification
// needs the host's public key and a trust decision, and both of those belong
// to the backend.
//
// So the companion reads the claims optimistically and treats them as a hint
// about what to draw. Every request it then makes carries the raw token, and
// the backend verifies signature, issuer, audience and expiry before acting.
// A user who edits their own token in dev tools changes what their browser
// draws and nothing else: the backend refuses them exactly as before, and
// audits it.

import type { IdentityClaims, Role } from "@shared/contract";
import { ROLES } from "@shared/contract";

export interface DecodedToken {
  claims: IdentityClaims;
  /** Unix seconds. Used to schedule the renewal request. */
  exp: number | null;
  /** Everything in the payload, for the demo's claims panel. */
  raw: Record<string, unknown>;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  // atob gives latin1; re-decode as UTF-8 so non-ASCII names survive.
  return decodeURIComponent(
    Array.from(json)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  );
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Returns null on anything malformed. A malformed token is not an error worth
 * showing the user: the backend is about to reject it anyway, and the UI
 * simply stays in its waiting state.
 */
export function decodeJwtUnverified(token: string): DecodedToken | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<
      string,
      unknown
    >;

    if (!isRole(payload.role)) return null;
    if (typeof payload.sub !== "string") return null;

    const scope = Array.isArray(payload.scope)
      ? payload.scope.filter((entry): entry is string => typeof entry === "string")
      : [];

    return {
      claims: {
        sub: payload.sub,
        name: typeof payload.name === "string" ? payload.name : "there",
        role: payload.role,
        policy_id:
          typeof payload.policy_id === "string" ? payload.policy_id : null,
        deceased_flag: payload.deceased_flag === true,
        scope,
      },
      exp: typeof payload.exp === "number" ? payload.exp : null,
      raw: payload,
    };
  } catch {
    return null;
  }
}

/** Seconds until expiry, or null when the token carries no exp. */
export function secondsUntilExpiry(exp: number | null): number | null {
  if (exp === null) return null;
  return exp - Math.floor(Date.now() / 1000);
}
