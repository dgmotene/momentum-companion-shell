"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type PersonaDashboardView,
  getDashboardViewByEmail,
  getMockPortalData,
} from "../lib/mockPortalData";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const [dashboardView, setDashboardView] =
    useState<PersonaDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emailParam = searchParams.get("email")?.trim().toLowerCase() ?? "";

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      const data = await getMockPortalData();
      const view = getDashboardViewByEmail(emailParam);

      if (!emailParam || !view) {
        setError("Please sign in with a valid member email to continue.");
        setDashboardView(null);
        setLoading(false);
        return;
      }

      setDashboardView(view);
      setLoading(false);
    };

    loadDashboard();
  }, [emailParam]);

  if (!dashboardView) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-bg px-4 py-6 text-brand-ink">
        Loading your dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-brand-bg px-4 py-6 text-brand-ink sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[32px] border border-brand-border bg-brand-surface p-4 shadow-[0_24px_80px_rgba(0,109,119,0.08)] sm:p-6 lg:p-8">
        <header className="rounded-[24px] border border-brand-border bg-[linear-gradient(135deg,_rgba(234,249,247,1),_rgba(250,250,250,1))] p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-teal text-sm font-semibold text-white">
                L
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-brand-teal">
                  Member portal
                </p>
                <h1 className="font-serif text-3xl text-brand-ink sm:text-4xl">
                  {dashboardView.greeting}
                </h1>
              </div>
            </div>

            <div className="rounded-2xl border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-inkSoft">
              <p className="font-semibold text-brand-tealDark">
                Next milestone
              </p>
              <p className="mt-1">{dashboardView.milestone}</p>
            </div>
          </div>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-brand-inkFaint">
            {dashboardView.intro}
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[24px] border border-brand-border bg-brand-surface p-6 shadow-[0_16px_48px_rgba(0,109,119,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-inkFaint">
                  Quick actions
                </p>
                <h2 className="mt-2 text-xl font-semibold text-brand-ink">
                  What would you like to do today?
                </h2>
              </div>
              <button className="rounded-full bg-brand-blueTint px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-teal">
                Talk to Lumina
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {dashboardView.quickActions.map((action) => (
                <button
                  key={action.title}
                  className="rounded-2xl border border-brand-border bg-brand-bg p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-teal"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-brand-ink">
                      {action.title}
                    </p>
                    <span className="rounded-full bg-brand-blueTint px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-teal">
                      {action.badge}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-brand-inkFaint">
                    {action.subtitle}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-brand-border bg-gradient-to-br from-brand-teal via-brand-tealDark to-brand-blue p-6 text-brand-surface shadow-[0_16px_48px_rgba(0,109,119,0.12)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-surface/80">
              {dashboardView.snapshotTitle}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {dashboardView.snapshotValue}
            </h2>
            <p className="mt-3 text-sm leading-7 text-brand-surface/80">
              {dashboardView.snapshotDescription}
            </p>
            <div className="mt-6 rounded-2xl border border-brand-surface/20 bg-brand-surface/10 p-4 backdrop-blur">
              {dashboardView.snapshotDetails.map((detail) => (
                <div
                  key={detail.label}
                  className="mt-3 flex items-center justify-between text-sm first:mt-0"
                >
                  <span className="text-brand-surface/70">{detail.label}</span>
                  <span className="font-semibold">{detail.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[24px] border border-brand-border bg-brand-surface p-6 shadow-[0_16px_48px_rgba(0,109,119,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-inkFaint">
              Current activity
            </p>
            <div className="mt-4 space-y-3">
              {dashboardView.activity.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-2xl border border-brand-border bg-brand-bg px-4 py-3"
                >
                  <span className="text-sm font-semibold text-brand-ink">
                    {item.label}
                  </span>
                  <span className="text-sm text-brand-inkSoft">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-brand-border bg-brand-surface p-6 shadow-[0_16px_48px_rgba(0,109,119,0.06)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-inkFaint">
              Suggested next steps
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {dashboardView.insights.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-brand-border bg-brand-bg p-4"
                >
                  <p className="text-sm font-semibold text-brand-ink">
                    {item.title}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-brand-tealDark">
                    {item.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-brand-inkFaint">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
