"use client";

// The signed-in portal.
//
// One route with client-side views rather than separate routes per section,
// deliberately: a route change tears down and rebuilds the companion's iframes,
// which would drop a reply in flight and reset a claim the user was part-way
// through. A real portal SPA keeps the widget alive as the user moves around,
// so the demo behaves the way the real thing would. Signing in is the only hard
// navigation, and nothing is in progress at that point.
//
// Identity comes from the server. This page asks /api/me who is signed in and
// renders that; it cannot choose or change the answer, and it holds no
// authority over what the companion may do.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  capabilitiesFor,
  isStaffRole,
  type IdentityClaims,
  type PageContext,
} from "@shared/contract";
import { getPolicy } from "@/lib/policies";
import { useCompanion } from "@/lib/use-companion";
import { PortalChrome, type PortalView } from "@/components/PortalChrome";
import { Dashboard } from "@/components/Dashboard";
import { ClientPicker } from "@/components/ClientPicker";
import { WhatIfExplorer } from "@/components/WhatIfExplorer";

type SessionUser = IdentityClaims & { initials: string };

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  /** Distinguishes "not signed in" from "haven't asked yet". */
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<PortalView>("dashboard");
  /** Staff only: the policy currently being acted on. */
  const [actingFor, setActingFor] = useState<string | null>(null);

  const staff = user ? isStaffRole(user.role) : false;

  // Do not embed an assistant for a user who holds no capabilities. She would
  // only be refused, and being refused by something that greeted her warmly is
  // worse than not being greeted. A decision about what belongs on a page, not
  // a security control: the backend refuses her either way.
  const companionEnabled = user ? capabilitiesFor(user).length > 0 : false;

  const { open, sendPageContext } =
    useCompanion(user !== null, companionEnabled);

  // The session is an httpOnly cookie this page cannot read, so it has to ask.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "same-origin" });
        const body = (await res.json()) as { user: SessionUser | null };
        if (cancelled) return;
        if (!body.user) {
          router.replace("/login");
          return;
        }
        setUser(body.user);
        setView(isStaffRole(body.user.role) ? "clients" : "dashboard");
      } catch {
        if (!cancelled) router.replace("/login");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const activePolicy = getPolicy(staff ? actingFor : (user?.policy_id ?? null));

  const handleContextChange = useCallback(
    (context: PageContext) => {
      sendPageContext({ ...context, acting_for: staff ? actingFor : null });
    },
    [sendPageContext, staff, actingFor]
  );

  // Page context was published only by the What-If Explorer, so a staff user
  // who picked a client anywhere else left the companion believing nobody was
  // selected. The choice itself is what the assistant needs to hear.
  useEffect(() => {
    if (!user) return;
    handleContextChange({
      page: view === "clients" ? "client_picker" : "dashboard",
      summary: activePolicy
        ? `The portal is showing policy ${activePolicy.id}, held by ${activePolicy.policyholderName}.`
        : "No policy is open in the portal yet.",
    });
  }, [user, view, activePolicy, handleContextChange]);

  const handleSignOut = useCallback(async () => {
    // Clear the browser's view first, so nothing renders for a user on their
    // way out, then drop the cookie so no further identity tokens can be
    // minted. Any token already in the companion dies within 15 minutes.
    setUser(null);
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
    }).catch(() => undefined);
    router.replace("/login");
  }, [router]);

  const handleSelectClient = useCallback((policyId: string) => {
    setActingFor(policyId);
    setView("dashboard");
  }, []);

  const body = useMemo(() => {
    if (!user) return null;

    if (view === "clients") {
      return (
        <ClientPicker
          claims={user}
          actingFor={actingFor}
          onSelect={handleSelectClient}
        />
      );
    }

    if (view === "what-if") {
      if (!activePolicy) {
        return (
          <p className="text-[13.5px] text-brand-inkSoft">
            Open a client before using the calculators.
          </p>
        );
      }
      return (
        <WhatIfExplorer
          policy={activePolicy}
          onContextChange={handleContextChange}
          onAskLumina={open}
        />
      );
    }

    return (
      <Dashboard
        claims={user}
        actingFor={actingFor}
        onOpenCompanion={open}
        onChooseClient={() => setView("clients")}
      />
    );
  }, [
    user,
    view,
    actingFor,
    activePolicy,
    handleSelectClient,
    handleContextChange,
    open,
  ]);

  if (!hydrated || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-bg font-sans text-brand-ink">
        <span
          aria-hidden="true"
          className="h-10 w-10 animate-pulse rounded-full bg-brand-tealDark"
        />
        <span className="sr-only">Loading the portal</span>
      </main>
    );
  }

  return (
    <PortalChrome
      claims={user}
      initials={user.initials}
      onSignOut={() => void handleSignOut()}
    >
      {body}
    </PortalChrome>
  );
}
