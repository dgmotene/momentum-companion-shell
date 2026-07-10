// Generates a keypair used to sign and verify the mock login token.
// The host signs tokens with the private key, and the companion backend
// checks them with the public key. Keys are generated locally and
// git-ignored, they're never committed to the repo.
//
// Note: this is just for the fake login. It's unrelated to the Momentum AI
// Gateway credentials, which are a separate secret (see .env.example).

import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keysDir = join(root, "keys");

if (existsSync(join(keysDir, "private.pem"))) {
  console.log("keys/ already has a keypair, leaving it untouched.");
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

mkdirSync(keysDir, { recursive: true });
writeFileSync(
  join(keysDir, "private.pem"),
  privateKey.export({ type: "pkcs8", format: "pem" })
);
writeFileSync(
  join(keysDir, "public.pem"),
  publicKey.export({ type: "spki", format: "pem" })
);

console.log("Generated RS256 keypair in keys/ (private.pem, public.pem).");
console.log("These are mock identity keys for local dev only. Do not commit.");
