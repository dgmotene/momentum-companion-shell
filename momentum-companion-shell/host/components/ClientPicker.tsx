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
      <h1 className="text-[21px] font-semibold text-ink">
        {unrestricted ? "Find a policy" : "Your clients"}
      </h1>
      <p className="mt-2 max-w-lg text-[13.5px] leading-relaxed text-ink-soft">
        {unrestricted
          ? "You can open any policy in order to help a caller. Each one you open is recorded against your name."
          : "You are authorised for these policies only. Anything outside this list is refused by the server, not just hidden here."}
      </p>

      <ul className="mt-5 max-w-2xl space-y-3">
        {subjects.map((policyId) => {
          const policy = getPolicy(policyId);
          const selected = actingFor === policyId;

          return (
            <li key={policyId}>
              <button
                type="button"
                onClick={() => onSelect(policyId)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-4 rounded-card border bg-surface px-5 py-4 text-left shadow-sm transition hover:border-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 ${
                  selected ? "border-teal ring-1 ring-teal" : "border-line"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-semibold text-ink">
                    {POLICY_LABELS[policyId] ?? policyId}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] text-ink-faint">
                    {policy
                      ? `${policy.masked} · ${policy.status}${
                          policy.deceased ? " · claim in progress" : ""
                        }`
                      : policyId}
                  </span>
                  {policy && policy.outstanding.length > 0 && (
                    <span className="mt-1.5 block text-[12px] font-semibold text-amber-text">
                      {policy.outstanding.length} outstanding requirement
                      {policy.outstanding.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-teal">
                  {selected ? "Selected" : "Open"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 max-w-lg text-[12px] leading-relaxed text-ink-faint">
        The signed token carries the scope{" "}
        <code className="text-ink-soft">
          {unrestricted ? "[*]" : `[${claims.scope.join(", ")}]`}
        </code>
        . The policy you select travels per-request as{" "}
        <code className="text-ink-soft">acting_for</code>, and the audit log
        records both you and the policy.
      </p>
    </section>
  );
}
