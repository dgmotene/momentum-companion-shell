// POST /api/token - mints the short-lived identity token for the companion.
//
// Takes NO parameters. That is the important part.
//
// An earlier version accepted a persona name in the body, which meant the
// browser chose its own identity: anyone could ask for a service-agent token
// and receive one. Now the only input is the httpOnly session cookie, so the
// server answers "who is this?" from something the browser cannot forge or
// even read.
//
// Every call re-reads the directory, so a role change or a newly set
// deceased_flag is picked up on the next renewal rather than being frozen at
// login. Combined with the 15-minute life, that bounds how stale an
// authorisation can be.
//
// This token says who the USER is. It is unrelated to the AI Gateway's virtual
// key, which lives only in the companion backend's environment and never
// touches a browser. Two credentials, two paths, never crossing.

import { NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findUserBySub } from "@/lib/users";
import { readSession } from "@/lib/session";
import {
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  TOKEN_TTL_SECONDS,
} from "@shared/contract";

const ISSUER = process.env.JWT_ISSUER ?? TOKEN_ISSUER;
const AUDIENCE = process.env.JWT_AUDIENCE ?? TOKEN_AUDIENCE;
const KEY_PATH =
  process.env.JWT_PRIVATE_KEY_PATH ??
  path.join(process.cwd(), "..", "keys", "private.pem");
const KID = "mock-key-1";

export async function POST() {
  const sub = await readSession();
  if (!sub) {
    // No live portal session, so no identity token. This is what stops the
    // companion renewing indefinitely after a user signs out: the session is
    // the real outer bound on access, and it is checked here every time.
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const user = findUserBySub(sub);
  if (!user) {
    // Valid session for a profile that no longer exists (deactivated between
    // logins). Refuse rather than mint against a stale subject.
    return NextResponse.json({ error: "Profile unavailable" }, { status: 403 });
  }

  let pem: string;
  try {
    pem = await readFile(KEY_PATH, "utf8");
  } catch {
    return NextResponse.json(
      {
        error:
          "Private key not found. Run `npm run setup` in momentum-companion-shell/.",
      },
      { status: 500 }
    );
  }

  const key = await importPKCS8(pem, "RS256");

  const token = await new SignJWT({ ...user.claims })
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(key);

  // `expiresIn` is returned so the loader can renew ahead of expiry rather
  // than waiting for a failure. It is a hint about timing, not a credential.
  return NextResponse.json({ token, expiresIn: TOKEN_TTL_SECONDS });
}
