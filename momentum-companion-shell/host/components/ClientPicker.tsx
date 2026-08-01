"use client";

// Staff subject selection.
//
// The three staff personas act on other people's policies, so before the
// product does anything useful they have to say whose. That choice is
// `acting_for`, and it travels with every request.
//
// The list here comes from the token's signed `scope`, which is the
// authorisation. Rendering only what the token allows keeps a user from
// walking into a refusal for no reason, but it is not the control: the
// backend re-checks `acting_for` against `scope` on every single request, so
// a hand-crafted call naming a policy outside scope is refused and audited
// exactly as if it had come from the UI.
//
// A service agent's scope is "*", which is a lot of authority. The answer to
// that is not a shorter list, it is accountability: every policy opened is
// recorded against the agent's name.

import { isStaffRole, type IdentityClaims } from "@shared/contract";
import { POLICY_LABELS, subjectsFor } from "@/lib/directory";
import { getPolicy } from "@/lib/policies";

export function ClientPicker({
  claims,
  actingFor,
  onSelect,
}: {
  claims: IdentityClaims;
  actingFor: string | null;
  onSelect: (policyId: string) => void;
}) {
  if (!isStaffRole(claims.role)) {
    return (
      <p className="text-[13.5px] text-ink-soft">
        This section is only used by staff roles.
      </p>
    );
  }

  const subjects = subjectsFor(claims.scope);
  const unrestricted = claims.scope.includes("*");

  return (
    <section>
      <h1 className="text-[20px] font-semibold text-brand-ink sm:text-[21px]">
        {unrestricted ? "Find a policy" : "Your clients"}
      </h1>
      <p className="mt-1 max-w-lg text-[12px] leading-relaxed text-brand-inkSoft sm:mt-2 sm:text-[13.5px]">
        {unrestricted
          ? "You can open any policy in order to help a caller. Each one you open is recorded against your name."
          : "You are authorised for these policies only. Anything outside this list is refused by the server, not just hidden here."}
      </p>

      <ul className="mt-4 max-w-2xl space-y-2 sm:mt-5 sm:space-y-3">
        {subjects.map((policyId) => {
          const policy = getPolicy(policyId);
          const selected = actingFor === policyId;

          return (
            <li key={policyId}>
              <button
                type="button"
                onClick={() => onSelect(policyId)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-[12px] border bg-brand-surface px-4 py-3 text-left text-[12px] shadow-sm transition hover:border-brand-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 sm:gap-4 sm:px-5 sm:py-4 sm:text-[14.5px] sm:rounded-lg ${
                  selected ? "border-brand-teal ring-1 ring-brand-teal" : "border-brand-border"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-brand-ink">
                    {POLICY_LABELS[policyId] ?? policyId}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-brand-inkFaint sm:text-[12.5px]">
                    {policy
                      ? `${policy.masked} · ${policy.status}${
                          policy.deceased ? " · claim in progress" : ""
                        }`
                      : policyId}
                  </span>
                  {policy && policy.outstanding.length > 0 && (
                    <span className="mt-1 block text-[11px] font-semibold text-brand-amberText sm:text-[12px]">
                      {policy.outstanding.length} outstanding requirement
                      {policy.outstanding.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-brand-teal sm:text-[12px]">
                  {selected ? "Selected" : "Open"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 max-w-lg text-[11px] leading-relaxed text-brand-inkFaint sm:mt-6 sm:text-[12px]">
        The signed token carries the scope{" "}
        <code className="text-brand-inkSoft">
          {unrestricted ? "[*]" : `[${claims.scope.join(", ")}]`}
        </code>
        . The policy you select travels per-request as{" "}
        <code className="text-brand-inkSoft">acting_for</code>, and the audit log
        records both you and the policy.
      </p>
    </section>
  );
}
