"use client";

import { useRouter } from "next/navigation";
import { CircleX, Clock } from "lucide-react";
import { Button } from "@/components/ui";
import { AuthBody, AuthHero } from "./AuthCard";
import type { InvitationState } from "./useInvitation";

type Problem = Exclude<InvitationState, { status: "loading" | "valid" }>;

/** Expired, already used, or could not be checked. Always says what to do next. */
export function InvitationProblem({ state }: { state: Problem }) {
  const router = useRouter();
  if (state.status === "error") {
    return (
      <>
        <AuthHero title="We could not check this invitation" />
        <AuthBody>
          <p role="alert" className="flex items-start gap-2 text-sm font-medium text-danger">
            <CircleX size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        </AuthBody>
      </>
    );
  }
  const expired = state.status === "expired";
  return (
    <>
      <AuthHero title={expired ? "This invitation has expired" : "This invitation was already used"} />
      <AuthBody>
        <p className="flex items-start gap-3 text-base leading-6 text-ink">
          <Clock size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          {expired
            ? `The link from ${state.clientName} is no longer valid. Ask them to create a new invitation link in SQ Keys.`
            : `The link from ${state.clientName} works once and has already been accepted. If that was you, sign in. Otherwise ask them to create a new link.`}
        </p>
        {!expired && <Button onClick={() => router.push("/login")}>Sign in</Button>}
      </AuthBody>
    </>
  );
}
