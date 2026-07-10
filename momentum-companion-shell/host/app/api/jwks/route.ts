// Serves the mock JWKS (public key) at /.well-known/jwks.json via a rewrite.

import { NextResponse } from "next/server";
import { importSPKI, exportJWK } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";

const PUBLIC_KEY_PATH =
  process.env.JWT_PUBLIC_KEY_PATH ?? path.join(process.cwd(), "..", "keys", "public.pem");
const KID = "mock-key-1";

// Read the key per request so a regenerated keypair is picked up without a
// restart, and never let Next cache the response at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  let pem: string;
  try {
    pem = await readFile(PUBLIC_KEY_PATH, "utf8");
  } catch {
    return NextResponse.json(
      { error: "Public key not found. Run `npm run setup` at the repo root." },
      { status: 500 }
    );
  }
  const key = await importSPKI(pem, "RS256");
  const jwk = await exportJWK(key);
  return NextResponse.json({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] });
}
