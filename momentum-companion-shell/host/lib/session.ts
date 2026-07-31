// The portal session. SERVER ONLY.
//
// Two credentials with two very different lifetimes, and keeping them separate
// is the point:
//
//   Portal session  httpOnly cookie, 8 hours, never readable by JavaScript.
//                   Proves the user logged in. Lives only between the browser
//                   and the host.
//
//   Identity token  15 minutes, handed to the companion, forwarded to the
//                   backend. Readable by the companion's JavaScript, because
//                   it has to be.
//
// The short-lived token is the one that leaves the host, so the one that could
// leak is the one that expires quickly. Renewal requires presenting the
// session cookie, which means the design's claim that "renewal only works
// while the companion sits inside a live, authenticated portal page" is
// actually enforced rather than merely asserted: the moment the session
// expires or the user signs out, no further identity tokens can be minted, and
// the companion goes quiet within one token life.
//
// Signed with the same RSA keypair the identity tokens use, so there is no
// extra secret to manage. A different audience keeps the two kinds of token
// from ever being mistaken for each other.

import "server-only";
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from "jose";
import { readFile } from "node:fs/promises";
import { cookies } from "next/headers";
import path from "node:path";

const PRIVATE_KEY_PATH =
  process.env.JWT_PRIVATE_KEY_PATH ??
  path.join(process.cwd(), "..", "keys", "private.pem");
const PUBLIC_KEY_PATH =
  process.env.JWT_PUBLIC_KEY_PATH ??
  path.join(process.cwd(), "..", "keys", "public.pem");

export const SESSION_COOKIE = "momentum_portal_session";
const SESSION_ISSUER = "https://mock-host.local";
/** Distinct from the companion token's audience, on purpose. */
const SESSION_AUDIENCE = "host-session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export class KeyMissingError extends Error {}

async function privateKey() {
  try {
    return await importPKCS8(await readFile(PRIVATE_KEY_PATH, "utf8"), "RS256");
  } catch {
    throw new KeyMissingError(
      "Signing key not found. Run `npm run setup` in momentum-companion-shell/."
    );
  }
}

async function publicKey() {
  try {
    return await importSPKI(await readFile(PUBLIC_KEY_PATH, "utf8"), "RS256");
  } catch {
    throw new KeyMissingError(
      "Public key not found. Run `npm run setup` in momentum-companion-shell/."
    );
  }
}

/** Issue the session cookie after a successful credential check. */
export async function startSession(sub: string): Promise<void> {
  const token = await new SignJWT({ sub })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(await privateKey());

  cookies().set(SESSION_COOKIE, token, {
    // Not readable by script, so an XSS on the portal cannot lift the session
    // and mint fresh identity tokens forever.
    httpOnly: true,
    sameSite: "lax",
    // Off in development because the demo runs on http://localhost.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function endSession(): void {
  cookies().delete(SESSION_COOKIE);
}

/**
 * The `sub` of the signed-in user, or null.
 *
 * Verifies the signature, issuer, audience and expiry, exactly as the backend
 * does for identity tokens. A tampered or expired cookie is simply not a
 * session.
 */
export async function readSession(): Promise<string | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  try {
    const { payload } = await jwtVerify(cookie, await publicKey(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ["RS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
