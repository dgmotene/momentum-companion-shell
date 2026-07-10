// POST /api/token - fakes a login by signing a JWT for the user.
//
// This runs server-side (in the host), so the private key never gets sent to
// the browser. The companion backend later checks this signature using the
// public key the host publishes at /.well-known/jwks.json.
//
// Note: this token only proves who the user is. It has nothing to do with
// the Momentum AI Gateway credentials, which live only in the backend's env.

import { NextResponse } from "next/server";
import { SignJWT, importPKCS8 } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ISSUER = process.env.JWT_ISSUER ?? "https://mock-host.local";
const AUDIENCE = process.env.JWT_AUDIENCE ?? "companion-backend";
const KEY_PATH =
  process.env.JWT_PRIVATE_KEY_PATH ?? path.join(process.cwd(), "..", "keys", "private.pem");
const KID = "mock-key-1";

// Fake user profiles, matching the rows in db/seed.sql. On a beneficiary's
// token, deceased_flag refers to their linked policyholder; it is what
// unlocks the restricted role.
const PERSONAS: Record<string, Record<string, unknown>> = {
  policyholder: {
    sub: "user-001", // Thandi Mokoena
    role: "policyholder",
    policy_id: "POL-1001",
    deceased_flag: false,
  },
  beneficiary: {
    sub: "user-003", // Sipho Dlamini, on his late mother's policy
    role: "beneficiary",
    policy_id: "POL-1002",
    deceased_flag: true,
  },
};

export async function POST(req: Request) {
  const { persona } = await req.json().catch(() => ({ persona: null }));
  const claims = PERSONAS[persona as string];
  if (!claims) {
    return NextResponse.json({ error: "Unknown persona" }, { status: 400 });
  }

  let pem: string;
  try {
    pem = await readFile(KEY_PATH, "utf8");
  } catch {
    return NextResponse.json(
      { error: "Private key not found. Run `npm run setup` at the repo root." },
      { status: 500 }
    );
  }

  const key = await importPKCS8(pem, "RS256");
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("15m") // token expires quickly, on purpose
    .sign(key);

  return NextResponse.json({ token });
}
