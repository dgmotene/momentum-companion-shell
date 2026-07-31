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
      <main className="flex min-h-screen items-center justify-center bg-brand-bg text-brand-ink">
        Loading your dashboard...
      </main>
    );
  }

  const displayName = dashboardView.greeting
    .replace(/^Welcome back,\s*/i, "")
    .replace(/\.$/, "");
  const avatar = dashboardView.roleLabel
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const statusValue =
    dashboardView.snapshotDetails.find((item) =>
      item.label.toLowerCase().includes("status"),
    )?.value ?? "Active";
  const currencyValue = "R 500 000";
  const premiumValue =
    dashboardView.activity.find((item) =>
      item.label.toLowerCase().includes("premium"),
    )?.value ?? "Current";
  const termValue = dashboardView.insights[0]?.value ?? "Active";
  const beneficiaryNote =
    dashboardView.roleLabel.toLowerCase() === "beneficiary"
      ? "Policy of the late Deven Pillay"
      : "";

  return (
    <main className="min-h-screen bg-brand-bg p-6 text-brand-ink font-sans">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[24px] border border-brand-border bg-brand-surface shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between border-b border-brand-border px-8 py-6">
          <div className="text-[20px] font-semibold tracking-[0.04em] text-brand-ink">
            MOMENTUM LIFE INSURANCE{" "}
            <span className="ml-2 text-sm font-semibold text-brand-inkSoft">
              – My Policies
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-lg text-brand-inkSoft">🔔</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tealDark font-semibold text-brand-surface">
              {avatar}
            </div>
          </div>
        </div>

        {dashboardView.roleLabel.toLowerCase() === "beneficiary" ? (
          <div className="flex items-center gap-2 border-b border-brand-amber/60 bg-brand-amberTint px-8 py-3 text-sm font-semibold text-brand-amberText">
            You are viewing this policy as a Beneficiary.
          </div>
        ) : null}

        <div className="min-h-[560px] px-8 py-7">
          <section>
            <div className="text-[22px] font-semibold text-brand-ink">
              Welcome back, <span>{displayName}</span>
            </div>
            <div className="mt-1 text-sm text-brand-inkSoft">
              {dashboardView.roleLabel}
            </div>

            <div className="mt-6 max-w-[640px] rounded-[18px] border border-brand-border bg-brand-bg p-6">
              <h3 className="mb-2 text-lg font-semibold text-brand-ink">
                Policy
              </h3>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                }}
              >
                <div>
                  <div className="font-serif text-[20px] font-semibold text-brand-ink">
                    {dashboardView.snapshotTitle}
                  </div>
                  <div className="mt-1 text-sm text-brand-inkSoft">
                    #POL-***654
                  </div>
                  {beneficiaryNote ? (
                    <div className="mt-1 text-xs font-medium text-brand-inkSoft">
                      {beneficiaryNote}
                    </div>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-brand-greenTint px-3 py-1 text-[12px] font-semibold text-brand-green">
                  ● {statusValue}
                </span>
              </div>

              <div className="mt-5 text-[32px] font-semibold text-brand-ink">
                {currencyValue}
              </div>
              <div className="mt-3 grid gap-2 border-t border-brand-border pt-3">
                <div className="flex items-center justify-between text-sm text-brand-inkSoft">
                  <span>Coverage</span>
                  <span>{dashboardView.snapshotDescription}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-brand-inkSoft">
                  <span>Premium</span>
                  <span>{premiumValue}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-brand-inkSoft">
                  <span>Health</span>
                  <span>{termValue}</span>
                </div>
              </div>
              <div className="mt-5 flex h-11 items-end gap-2">
                {[40, 60, 50, 80, 65, 90].map((height) => (
                  <div
                    key={height}
                    className="flex-1 rounded-t-full bg-brand-tealDark"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <p className="mt-6 text-[11px] text-brand-inkFaint">
              Momentum Life Insurance Co. Lumina is an AI assistant; for binding
              decisions, information will be confirmed by a licensed
              representative.
            </p>
          </section>
        </div>

        <div className="flex items-center gap-3 px-8 pb-7 text-brand-inkSoft">
          <div className="h-[18px] w-[18px] rounded-full bg-brand-tealDark" />
          <span className="font-semibold text-brand-ink">Lumina</span>
          <span>Tap to chat</span>
        </div>
      </div>
    </main>
  );
}
