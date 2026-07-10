"use client";

// This is the companion page, loaded inside the host's iframe. It has no
// login of its own; it gets the user's identity from the host instead.
//
// What it does, in order:
//   1. Listens for the token via window.postMessage.
//   2. Checks that the message came from an allowed origin.
//   3. Decodes the token just to show the claims on screen (this is NOT the
//      real security check, that happens on the backend).
//   4. Sends the token to the companion backend's /api/verify route.

import { useEffect, useState } from "react";
import { ALLOWED_PARENT_ORIGINS } from "../lib/origins";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_COMPANION_BACKEND_URL ?? "http://localhost:4000";

type Claims = Record<string, unknown>;

function decodeUnverified(jwt: string): Claims | null {
  // Just reads the token to display it. Does not check if it's valid.
  try {
    const payload = jwt.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export default function Companion() {
  const [claims, setClaims] = useState<Claims | null>(null);
  const [verify, setVerify] = useState<string>("Waiting for identity token from host…");
  const [rejected, setRejected] = useState<string | null>(null);

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      // Ignore messages from anywhere not on our allowlist.
      if (!ALLOWED_PARENT_ORIGINS.includes(event.origin)) {
        setRejected(`Rejected postMessage from untrusted origin: ${event.origin}`);
        return;
      }
      if (event.data?.type !== "COMPANION_IDENTITY_TOKEN") return;

      const token: string = event.data.token;
      setClaims(decodeUnverified(token));

      // The backend does the actual security check: signature, issuer,
      // audience, and expiry.
      setVerify("Sent to companion backend for verification...");
      try {
        const res = await fetch(`${BACKEND_URL}/api/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json();
        setVerify(
          res.ok
            ? `Backend verified ✔ role=${body.claims?.role}, policyId=${body.claims?.policyId}`
            : `Backend rejected token (401): ${body.error ?? "invalid"}`
        );
      } catch {
        setVerify("Could not reach companion backend. Is it running on :4000?");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <main className="p-6">
      <h1 className="text-lg font-semibold">AI Companion (embedded)</h1>
      <p className="mb-4 text-xs text-slate-500">
        Design-round environment shell. Chat UI, RAG, and workflows are stubs for now.
      </p>

      {rejected && (
        <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-700">{rejected}</p>
      )}

      <section className="mb-4 rounded border border-slate-200 p-3">
        <h2 className="mb-1 text-sm font-medium">
          Decoded claims (unverified, display only)
        </h2>
        {claims ? (
          <pre className="overflow-x-auto rounded bg-slate-50 p-2 text-xs">
            {JSON.stringify(claims, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-slate-500">No token received yet.</p>
        )}
      </section>

      <section className="rounded border border-slate-200 p-3">
        <h2 className="mb-1 text-sm font-medium">Backend verification status</h2>
        <p className="text-xs">{verify}</p>
      </section>

      {/* TODO: the chat UI goes here. AI calls will flow like this:
          companion frontend -> companion backend -> Momentum AI Gateway.
          The frontend never talks to the gateway directly. */}
    </main>
  );
}
