import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = process.env.JWT_ISSUER ?? "https://mock-host.local";
const AUDIENCE = process.env.JWT_AUDIENCE ?? "companion-backend";
export const HOST_ORIGIN = process.env.HOST_ORIGIN ?? "http://localhost:3000";

// jose caches this; the backend can verify tokens but never sign them.
const hostJWKS = createRemoteJWKSet(
  new URL(`${HOST_ORIGIN}/.well-known/jwks.json`)
);

export async function verifyIdentityToken(token) {
  const { payload } = await jwtVerify(token, hostJWKS, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ["RS256"],
  });
  return payload;
}

// No jose error code (or a JWKS timeout) = key fetch failed, not a bad token.
export function isKeyFetchError(err) {
  return !err.code || err.code === "ERR_JWKS_TIMEOUT";
}
