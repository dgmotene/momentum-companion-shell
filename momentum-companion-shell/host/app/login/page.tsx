"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABEL } from "@shared/contract";
import { DEMO_ACCOUNTS } from "@/lib/directory";

// Sign-in is checked on the SERVER, by POST /api/login.
//
// It used to be checked here: the page fetched the mock user table, compared
// the password in the browser, and redirected to /dashboard?email=... Three
// problems with that, and the third mattered most.
//
//   1. Every password shipped inside the client bundle.
//   2. Identity was a URL parameter, so typing any email into the address bar
//      was enough to become that person.
//   3. Nothing minted an identity token, so the companion never received an
//      identity at all and Lumina sat waiting forever.
//
// Now the server verifies the credential and sets an httpOnly session cookie
// this page cannot read; the dashboard asks /api/me who it is rendering for.
// The screen itself is unchanged.

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("Sign in to continue to your portal.");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setStatus("Checking your details...");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus(
          body?.error ?? "Use the mock credentials shown below to continue."
        );
        return;
      }

      setStatus("Login successful. Redirecting to your dashboard...");
      // No email in the URL: the session cookie carries the identity now.
      router.push("/dashboard");
    } catch {
      setStatus("Could not reach the portal. Is the host still running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-brand-blueTint px-4 py-8 text-brand-ink sm:px-6 lg:px-8"
      style={{
        backgroundImage:
          "radial-gradient(circle at top left, rgba(78, 205, 196, 0.24), transparent 60%)",
      }}
    >
      <div className="mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[28px] border border-brand-border bg-brand-surface shadow-[0_24px_80px_rgba(0,109,119,0.12)] lg:min-h-[calc(100vh-4rem)] lg:flex-row">
        <section className="relative flex w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-teal via-brand-tealDark to-brand-blue p-6 text-brand-surface sm:p-8 lg:w-[44%] lg:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_40%)]" />
          <div className="relative z-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-surface/20 text-lg font-semibold backdrop-blur">
                L
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-surface/80">
                  Momentum
                </p>
                <p className="text-xl font-semibold">Lumina</p>
              </div>
            </div>

            <div className="max-w-sm">
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.28em] text-brand-surface/70">
                Member portal
              </p>
              <h1 className="font-serif text-4xl leading-tight">
                Welcome back to your policy companion.
              </h1>
              <p className="mt-4 text-sm leading-7 text-brand-surface/80">
                Review updates, understand benefits, and ask for help with
                claims, beneficiaries, and life changes in one calm experience.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid gap-3 rounded-2xl border border-brand-surface/20 bg-brand-surface/10 p-4 backdrop-blur">
            <div className="flex items-center justify-between text-sm">
              <span className="text-brand-surface/70">Active members</span>
              <span className="font-semibold">24k+</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-brand-surface/70">
                Average response time
              </span>
              <span className="font-semibold">2 min</span>
            </div>
          </div>
        </section>

        <section className="flex-1 bg-brand-bg p-6 sm:p-8 lg:p-10">
          <div className="mx-auto flex h-full max-w-md flex-col justify-center">
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-teal">
                 Sign in to your Momentum account
              </h2>
             
    
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label
                  className="text-sm font-semibold text-brand-inkSoft"
                  htmlFor="email"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-brand-border bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-blueTint"
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-semibold text-brand-inkSoft"
                  htmlFor="password"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-brand-border bg-white px-4 py-3 text-sm text-brand-ink outline-none transition focus:border-brand-teal focus:ring-2 focus:ring-brand-blueTint"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl bg-brand-teal px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,109,119,0.2)] transition hover:-translate-y-0.5 hover:bg-brand-tealDark disabled:translate-y-0 disabled:opacity-60"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            {/* Demo credentials. Published on purpose: a judge has to be able
                to get in, and the point being shown is not that these are
                secret but that the SERVER decides who you are once you present
                one. Clicking a row fills the form; it does not sign you in, so
                the credential path is the same one a real user takes. */}
            <div className="mt-6 rounded-2xl bg-brand-bg p-4 text-xs leading-6 text-brand-inkFaint">
              <p className="mb-2 font-semibold text-brand-inkSoft">
                Demo accounts &middot; password{" "}
                <code className="text-brand-ink">password123</code>
              </p>
              <ul className="grid gap-1">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(account.password);
                      }}
                      className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-brand-blueTint"
                    >
                      <span className="truncate text-brand-ink">
                        {account.email}
                      </span>
                      <span className="shrink-0 text-brand-inkFaint">
                        {ROLE_LABEL[account.role]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-center">
                By signing in, you agree to Momentum&rsquo;s Terms of Service and
                Privacy Policy. Lumina is only available once you&rsquo;re
                signed in, so it always knows who it&rsquo;s helping and what it
                may share.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
