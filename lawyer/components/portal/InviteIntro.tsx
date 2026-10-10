"use client";

import { Check, ChevronRight, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Spinner } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { AuthBody, AuthHero } from "./AuthCard";
import { InvitationProblem } from "./InvitationProblem";
import { useInvitation } from "./useInvitation";

const CAN = ["Approve or decline large or unusual transfers", "Approve or decline recoveries and exits", "Set the limits for this client"];
const CANNOT = ["Move funds alone", "See their everyday transfers", "Access their phone key or Swissquote's part"];

/** L1. Texts: annex F.6. */
export function InviteIntro({ token }: { token: string }) {
  const state = useInvitation(token);
  const router = useRouter();

  if (state.status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner label="Checking your invitation" />
      </div>
    );
  }
  if (state.status !== "valid") return <InvitationProblem state={state} />;

  const { clientName, expiresAt } = state;
  return (
    <>
      <AuthHero title={`${clientName} invites you as their lawyer`} />
      <AuthBody>
        <p className="text-base leading-6 text-ink">
          You will protect {clientName}&apos;s wallet. You hold one third of the key and approve large or unusual transfers and
          recoveries. You can never move funds alone. You will not see their everyday transfers.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-labelledby="can" className="rounded-card bg-ok-bg p-4">
            <h2 id="can" className="text-sm font-semibold text-ok">
              What you can do
            </h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm leading-5 text-ink">
              {CAN.map((t) => (
                <li key={t} className="flex gap-2">
                  <Check size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="cannot" className="rounded-card bg-danger-bg p-4">
            <h2 id="cannot" className="text-sm font-semibold text-danger">
              What you can never do
            </h2>
            <ul className="mt-2 flex flex-col gap-2 text-sm leading-5 text-ink">
              {CANNOT.map((t) => (
                <li key={t} className="flex gap-2">
                  <X size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <p className="text-xs text-muted">This invitation works once and expires on {formatDate(expiresAt)}.</p>

        <Button
          trailingIcon={<ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => router.push(`/invite/${encodeURIComponent(token)}/account`)}
        >
          Continue
        </Button>
      </AuthBody>
    </>
  );
}
