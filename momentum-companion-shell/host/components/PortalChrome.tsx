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
      <header className="flex items-center gap-4 border-b border-brand-border bg-brand-surface px-7 py-3.5">
        <div className="text-[13px] font-bold tracking-[0.06em]">
          MOMENTUM <span className="font-medium text-brand-teal">life</span>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right leading-tight">
            <div className="text-[13px] font-semibold">{claims.name}</div>
            <div className="text-[11.5px] text-brand-inkFaint">
              {ROLE_LABEL[claims.role]}
            </div>
          </div>
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-tealDark text-[12px] font-bold text-brand-surface"
          >
            {initials}
          </span>
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-xl border border-brand-border px-3 py-1.5 text-[12px] font-semibold text-brand-inkSoft transition hover:border-brand-teal hover:text-brand-ink"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Why the user is looking at someone else's policy, stated plainly and
          never dismissible. Bereaved beneficiaries and staff both need this,
          for opposite reasons. */}
      {bereaved && (
        <div className="border-b border-brand-amber/60 bg-brand-amberTint px-7 py-2.5 text-[13px] font-semibold text-brand-amberText">
          You are viewing this policy as a Beneficiary.
        </div>
      )}
      {staff && (
        <div className="border-b border-brand-teal/25 bg-brand-blueTint px-7 py-2.5 text-[13px] font-semibold text-brand-tealDark">
          Staff access &middot; {ROLE_LABEL[claims.role]}. Every policy you open
          is recorded against your name.
        </div>
      )}

      <main className="px-8 py-7">{children}</main>
    </div>
  );
}
