"use client";

// The policy view the companion sits beside.
//
// Four shapes, all driven by the token rather than by a persona name:
//
//   policyholder            their own cover, servicing available
//   life insured            the cover that relates to them, no servicing
//   bereaved beneficiary    the late policyholder's cover, led by the claim
//   staff                   whichever client they have opened
//
// And a fifth that is a deliberate dead end: a beneficiary whose policyholder
// is still living sees nothing at all.
//
// Every amount here is a RECORDED contractual value. None of them is a payout
// figure, and nothing on this page describes one as such. Myriad guide p442 is
// the grounding: claims are assessed on merit and may be repudiated, payment
// runs through a waterfall of cessionary then beneficiary for proceeds, and any
// outstanding debt is deducted first.

import {
  capabilitiesFor,
  isStaffRole,
  type IdentityClaims,
} from "@shared/contract";
import { POLICY_LABELS } from "@/lib/directory";
import { formatRand, getPolicy, type Policy } from "@/lib/policies";

export function Dashboard({
  claims,
  actingFor,
  onOpenCompanion,
  onChooseClient,
}: {
  claims: IdentityClaims;
  actingFor: string | null;
  onOpenCompanion: () => void;
  onChooseClient: () => void;
}) {
  const capabilities = capabilitiesFor(claims);
  const staff = isStaffRole(claims.role);

  // Customers see their own policy; staff see the client they have opened.
  const policy = getPolicy(staff ? actingFor : claims.policy_id);

  // The deceased-flag gate. Reachable whenever a listed beneficiary's
  // policyholder is still alive, and deliberately a dead end.
  if (capabilities.length === 0) {
    return <NoAccessNotice name={claims.name} />;
  }

  if (staff && !policy) {
    const count = claims.scope.includes("*")
      ? "all policies"
      : `${claims.scope.length} ${claims.scope.length === 1 ? "policy" : "policies"}`;
    return (
      <section>
        <h1 className="font-serif text-[20px] font-semibold sm:text-[24px]">
          No client selected
        </h1>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-brand-inkSoft sm:mt-2 sm:text-[13.5px]">
          You are authorised for {count}. Open one to continue. Lumina follows
          whichever client you are viewing.
        </p>
        <button
          type="button"
          onClick={onChooseClient}
          className="mt-4 rounded-lg bg-brand-teal px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-brand-tealDark sm:mt-5 sm:px-5 sm:py-2.5 sm:text-[13.5px] sm:rounded-xl"
        >
          Choose a client
        </button>
      </section>
    );
  }

  if (!policy) {
    return (
      <p className="text-[13.5px] text-brand-inkSoft">
        No policy is linked to this profile.
      </p>
    );
  }

  const bereaved = claims.role === "beneficiary" && claims.deceased_flag;
  const isLifeInsured = claims.role === "life_insured";

  return (
    <section>
      <h1 className="font-serif text-[20px] font-semibold sm:text-[24px]">
        {policy.productName}
      </h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-brand-inkFaint sm:text-[13px]">
        <span>{policy.masked}</span>
        <span className="rounded-full bg-brand-greenTint px-2 py-0.5 text-[10px] font-semibold text-brand-green sm:text-[11px]">
          &#9679; {policy.status}
        </span>
      </p>

      {bereaved && (
        <p className="mt-1.5 text-[11px] font-semibold text-brand-inkSoft sm:text-[12px]">
          Policy of the late {policy.policyholderName}
        </p>
      )}

      {staff && (
        <p className="mt-1.5 text-[11px] text-brand-inkFaint sm:text-[12px]">
          Acting for{" "}
          <strong className="text-brand-inkSoft">
            {POLICY_LABELS[policy.id] ?? policy.id}
          </strong>{" "}
          &middot;{" "}
          <button
            type="button"
            onClick={onChooseClient}
            className="font-semibold text-brand-teal underline decoration-dotted"
          >
            switch client
          </button>
        </p>
      )}

      {/* The finals brief is explicit that the life insured is not always the
          policyholder, and the Myriad guide's Role players section treats
          them as separate parties. Say so on the page rather than leaving
          someone to assume they own a policy they do not. */}
      {policy.policyholderName !== policy.lifeInsuredName && (
        <p className="mt-1.5 text-[11px] text-brand-inkFaint sm:text-[12px]">
          Policyholder <strong>{policy.policyholderName}</strong> &middot; life
          insured <strong>{policy.lifeInsuredName}</strong>
          {isLifeInsured && " — that's you"}
        </p>
      )}
      
      {/* A bereaved beneficiary is led by the claim, not by servicing. */}
      {bereaved && (
        <div className="mt-4 rounded-[14px] border-[1.5px] border-brand-teal bg-gradient-to-b from-brand-blueTint to-brand-surface p-4 sm:mt-5 sm:rounded-[18px] sm:p-5 lg:max-w-2xl">
          <h2 className="font-serif text-[15px] font-semibold sm:text-[17px]">
            Hi {claims.name.split(" ")[0]}, I&rsquo;m so sorry for your loss.
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-brand-inkSoft sm:mt-1.5 sm:text-[13px]">
            Whenever you feel ready, Lumina can guide you through starting a
            claim, or simply answer questions about the policy. There is no rush,
            and a person is always available if you would prefer.
          </p>
          <button
            type="button"
            onClick={onOpenCompanion}
            className="mt-3 rounded-lg bg-brand-teal px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-tealDark sm:mt-4 sm:px-5 sm:py-3 sm:text-[14px] sm:rounded-xl"
          >
            Begin with Lumina &rarr;
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-5 lg:max-w-4xl lg:grid-cols-2">
        <BenefitsCard policy={policy} />
        {/* Premiums are the policyholder's business. A bereaved beneficiary has
            no use for them, and a life insured who does not own the policy is
            not the payer. */}
        <PolicyDetailsCard
          policy={policy}
          showPremium={!bereaved && !isLifeInsured}
        />
      </div>

      {policy.outstanding.length > 0 &&
        capabilities.includes("outstanding_requirements") && (
          <div className="mt-4 rounded-[14px] border border-brand-amber/60 bg-brand-amberTint p-4 sm:mt-5 sm:rounded-[18px] sm:p-5 lg:max-w-xl">
            <h2 className="text-[13px] font-semibold text-brand-amberText sm:text-[14px]">
              Outstanding requirements
            </h2>
            <ul className="mt-2 space-y-1 text-[12px] text-brand-amberText sm:text-[13px]">
              {policy.outstanding.map((item) => (
                <li key={item}>&bull; {item}</li>
              ))}
            </ul>
          </div>
        )}
    </section>
  );
}

function BenefitsCard({ policy }: { policy: Policy }) {
  return (
    <div className="rounded-[14px] border border-brand-border bg-brand-surface p-4 sm:rounded-[18px] sm:p-5">
      <h2 className="text-[13px] font-semibold sm:text-[14px]">Cover in place</h2>
      <ul className="mt-2 divide-y divide-brand-border sm:mt-3">
        {policy.benefits.map((benefit) => (
          <li
            key={benefit.name}
            className="flex items-baseline justify-between gap-3 py-2 sm:gap-4 sm:py-2.5"
          >
            <span className="text-[12px] text-brand-inkSoft sm:text-[13px]">
              {benefit.name}
            </span>
            <span className="text-right shrink-0">
              <span className="block text-[13px] font-semibold sm:text-[14px]">
                {benefit.amount}
              </span>
              <span className="block text-[10.5px] text-brand-inkFaint sm:text-[11.5px]">
                {benefit.shape}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {/* Recorded, not payable: the distinction the Scope Change brief
          requires, made on the page as well as in the chat. */}
      <p className="mt-2 border-t border-brand-border pt-2 text-[11px] leading-relaxed text-brand-inkFaint sm:mt-3 sm:pt-3 sm:text-[11.5px]">
        These are the benefit amounts recorded on the policy. What is actually
        payable on any claim depends on the policy terms and the outcome of
        claims assessment.
      </p>
    </div>
  );
}

function PolicyDetailsCard({
  policy,
  showPremium,
}: {
  policy: Policy;
  showPremium: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-brand-border bg-brand-surface p-4 sm:rounded-[18px] sm:p-5">
      <h2 className="text-[13px] font-semibold sm:text-[14px]">Policy details</h2>
      <dl className="mt-2 divide-y divide-brand-border sm:mt-3">
        {showPremium && (
          <Row
            label="Monthly premium"
            value={formatRand(policy.monthlyPremium)}
          />
        )}
        {showPremium && <Row label="Premium due" value={policy.premiumDueDay} />}
        <Row label="Sum assured" value={formatRand(policy.sumAssured)} />
        <Row
          label="Waiting period"
          value={
            policy.waitingPeriodMonths === 0
              ? "None"
              : `${policy.waitingPeriodMonths} months`
          }
        />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 sm:gap-4 sm:py-2.5">
      <dt className="text-[12px] text-brand-inkSoft sm:text-[13px]">{label}</dt>
      <dd className="text-[12.5px] font-semibold sm:text-[13.5px]">{value}</dd>
    </div>
  );
}

/**
 * The deceased-flag gate, made explicit.
 *
 * She authenticated successfully. The portal simply has nothing for her, and
 * says so without implying she did something wrong or that no policy exists.
 *
 * Note what it does not disclose: no policy number, no policyholder name, no
 * amount. Telling a stranger "yes, you are named on Thandi Mokoena's R500 000
 * policy" would itself be the disclosure we are declining to make.
 */
function NoAccessNotice({ name }: { name: string }) {
  return (
    <section className="max-w-xl">
      <h1 className="font-serif text-[20px] font-semibold sm:text-[24px]">
        Nothing to show here yet
      </h1>
      <div className="mt-3 rounded-[14px] border border-brand-border bg-brand-surface p-4 sm:mt-4 sm:rounded-[18px] sm:p-5">
        <p className="text-[12px] leading-relaxed text-brand-inkSoft sm:text-[13.5px]">
          Hi {name.split(" ")[0]}. You are signed in, but there is no policy
          information available to you at the moment.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-brand-inkSoft sm:mt-3 sm:text-[13.5px]">
          Being named on someone&rsquo;s policy does not give access to it while
          they are living. If circumstances change, Momentum will confirm the
          details before anything opens up here.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-brand-inkSoft sm:mt-3 sm:text-[13.5px]">
          If you think this is wrong, our team can help on{" "}
          <span className="font-semibold text-brand-ink">0860 66 26 66</span>.
        </p>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-brand-inkFaint sm:mt-4 sm:text-[12px]">
        Demo note: this profile is a listed beneficiary on an active policy whose
        policyholder is alive, so the token carries{" "}
        <code>deceased_flag: false</code> and every capability is closed. Lumina
        is not embedded for this user either.
      </p>
    </section>
  );
}
