"use client";

import { useState } from "react";

type Persona = "policyholder" | "beneficiary";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [status, setStatus] = useState("Sign in to continue to your portal.");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!selectedPersona) {
      setStatus("Choose a role to continue.");
      return;
    }

    setStatus(
      `Signed in as ${selectedPersona}. The companion is ready to help.`,
    );
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
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-teal">
                Secure sign in
              </p>
              <h2 className="mt-2 font-serif text-3xl text-brand-ink">
                Continue to your workspace
              </h2>
              <p className="mt-3 text-sm leading-7 text-brand-inkFaint">
                Use your member credentials to access the host experience and
                open the AI companion in context.
              </p>
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

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-brand-inkSoft">
                  <input
                    type="checkbox"
                    className="rounded border-brand-border text-brand-teal"
                  />
                  Remember me
                </label>
                <a href="#" className="font-semibold text-brand-teal">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                className="w-full rounded-2xl bg-brand-teal px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,109,119,0.2)] transition hover:-translate-y-0.5 hover:bg-brand-tealDark"
              >
                Sign in
              </button>
            </form>
            <div className="mt-6 text-xs text-brand-inkFaint text-center">
              By signing in, you agree to Momentum's Terms of Service and
              Privacy Policy. Lumina is only available once you're signed in, so
              it always knows who it's helping and what it may share.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
