"use client";

// This is the insurer's portal page - the "parent" app that embeds the
// companion in an iframe.
//
// The login below is fake. Clicking a button calls /api/token, which signs
// a JWT on the server (so the private key never reaches the browser). That
// token is then sent to the companion iframe using window.postMessage,
// always targeted at the companion's exact origin, never "*".

import { useEffect, useRef, useState } from "react";

const COMPANION_ORIGIN =
  process.env.NEXT_PUBLIC_COMPANION_ORIGIN ?? "http://localhost:3001";

type Persona = "policyholder" | "beneficiary";

export default function HostPortal() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [status, setStatus] = useState<string>("Not logged in.");

  async function loginAs(p: Persona) {
    setStatus("Signing mock identity token on the host...");
    // The token is created by the API route, so the private key never leaves the server.
    const res = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: p }),
    });
    if (!res.ok) {
      setStatus("Token endpoint failed. Did you run `npm run setup` to generate keys?");
      return;
    }
    const { token } = await res.json();
    setPersona(p);
    setToken(token);
    setStatus(`Logged in as ${p}. Token will be handed to the companion iframe.`);
  }

  // Send the token to the companion iframe. We also resend it whenever the
  // iframe (re)loads, so a refresh doesn't leave the companion without a token.
  useEffect(() => {
    if (!token) return;
    const send = () => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "COMPANION_IDENTITY_TOKEN", token },
        COMPANION_ORIGIN // never "*"
      );
    };
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", send);
    send();
    return () => iframe?.removeEventListener("load", send);
  }, [token]);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Momentum Member Portal</h1>
        <p className="text-sm text-slate-600">
          Mock host application, design-round environment shell. No real
          authentication, no real policy data.
        </p>
      </header>

      <section className="mb-6 rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-2 font-medium">Mock login</h2>
        <div className="flex gap-3">
          <button
            onClick={() => loginAs("policyholder")}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Log in as Policyholder
          </button>
          <button
            onClick={() => loginAs("beneficiary")}
            className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
          >
            Log in as Beneficiary
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">{status}</p>
      </section>

      <section className="rounded-lg border border-slate-300 bg-white p-4">
        <h2 className="mb-2 font-medium">Embedded AI companion</h2>
        <p className="mb-3 text-xs text-slate-500">
          Trust boundary: the iframe below is a separate origin (
          {COMPANION_ORIGIN}). Identity crosses this edge as a short-lived,
          scoped JWT via targeted postMessage.
        </p>
        <iframe
          ref={iframeRef}
          src={COMPANION_ORIGIN}
          title="AI Companion"
          className="h-[480px] w-full rounded border border-slate-200"
        />
        {persona && (
          <p className="mt-2 text-xs text-slate-500">
            Handed token for persona: <strong>{persona}</strong>
          </p>
        )}
      </section>
    </main>
  );
}
