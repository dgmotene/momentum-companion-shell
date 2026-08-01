"use client";

// Portal chrome: top bar, context banners, and the navigation rail.
//
// Styled with the brand-* palette so the portal reads as one product with the
// login screen the user just came through.
//
// The rail is role-aware, and it is worth being precise about what that means.
// Hiding "Calculators" from a bereaved beneficiary is a kindness: it keeps a
// grieving person away from a screen that would only refuse them. It is not a
// security control. The locks are shown rather than the items removed, so a
// user can see that something exists and is not theirs, instead of wondering
// whether the product is broken.
//
// Everything genuinely blocked is blocked by the backend after verifying the
// token, and every refusal is written to the audit log.

import { ROLE_LABEL, type IdentityClaims } from "@shared/contract";

export type PortalView = "dashboard" | "clients" | "what-if";

export function PortalChrome({
  claims,
  initials,
  onSignOut,
  children,
}: {
  claims: IdentityClaims;
  initials: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const bereaved = claims.role === "beneficiary" && claims.deceased_flag;
  const staff = claims.role === "adviser" || claims.role === "claims_assessor" || claims.role === "service_agent";

  return (
    <div className="min-h-screen bg-brand-bg font-sans text-brand-ink">
      <header className="flex flex-col gap-3 border-b border-brand-border bg-brand-surface px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-3.5 lg:px-8">
        <div className="text-[12px] font-bold tracking-[0.06em] sm:text-[13px]">
          MOMENTUM <span className="font-medium text-brand-teal">life</span>
        </div>

        <div className="ml-0 flex flex-col gap-2 sm:ml-auto sm:flex-row sm:items-center sm:gap-4">
          <div className="text-right leading-tight order-2 sm:order-none">
            <div className="text-[12px] font-semibold sm:text-[13px]">{claims.name}</div>
            <div className="text-[10.5px] text-brand-inkFaint sm:text-[11.5px]">
              {ROLE_LABEL[claims.role]}
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-tealDark text-[11px] font-bold text-brand-surface sm:h-9 sm:w-9 sm:text-[12px]"
            >
              {initials}
            </span>
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-lg border border-brand-border px-2.5 py-1 text-[11px] font-semibold text-brand-inkSoft transition hover:border-brand-teal hover:text-brand-ink sm:px-3 sm:py-1.5 sm:text-[12px] sm:rounded-xl"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Why the user is looking at someone else's policy, stated plainly and
          never dismissible. Bereaved beneficiaries and staff both need this,
          for opposite reasons. */}
      {bereaved && (
        <div className="border-b border-brand-amber/60 bg-brand-amberTint px-4 py-2 text-[12px] font-semibold text-brand-amberText sm:px-6 sm:py-2.5 sm:text-[13px] lg:px-8">
          You are viewing this policy as a Beneficiary.
        </div>
      )}
      {staff && (
        <div className="border-b border-brand-teal/25 bg-brand-blueTint px-4 py-2 text-[12px] font-semibold text-brand-tealDark sm:px-6 sm:py-2.5 sm:text-[13px] lg:px-8">
          Staff access &middot; {ROLE_LABEL[claims.role]}. Every policy you open
          is recorded against your name.
        </div>
      )}

      {/* data-companion-dock marks the column the docked companion lines up
          with. The loader never looks for it directly: use-companion measures
          this element and hands the loader plain pixel gutters, so the embed
          stays free of any Momentum layout knowledge. */}
      <main
        data-companion-dock
        className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7"
      >
        {children}
      </main>
    </div>
  );
}
