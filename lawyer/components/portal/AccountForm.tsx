"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Fingerprint } from "lucide-react";
import { Button, Checkbox, Input, SimulatedPill, Spinner } from "@/components/ui";
import { IS_MOCK, acceptInvitation } from "@/lib/lawyerApi";
import { AuthBody, AuthHero } from "./AuthCard";
import { InvitationProblem } from "./InvitationProblem";
import { useInvitation } from "./useInvitation";

type Errors = { name?: string; firm?: string; consent?: string };

/** L2. Texts: annex F.6. The passkey is created inside acceptInvitation (simulated in mock mode). */
export function AccountForm({ token }: { token: string }) {
  const state = useInvitation(token);
  const router = useRouter();
  const [name, setName] = useState("");
  const [firm, setFirm] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Spinner label="Checking your invitation" />
      </div>
    );
  }
  if (state.status !== "valid") return <InvitationProblem state={state} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Errors = {};
    if (!name.trim()) next.name = "Enter your name.";
    if (!firm.trim()) next.firm = "Enter your firm.";
    if (!consent) next.consent = "Confirm that you understand the role to continue.";
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await acceptInvitation(token, { displayName: name.trim(), firm: firm.trim() });
      router.push("/dashboard");
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHero title="Create your account" subtitle={`Invited by ${state.clientName}`} />
      <form onSubmit={submit} noValidate>
        <AuthBody>
          <p className="text-base leading-6 text-ink">Create your passkey. It identifies you every time you approve something.</p>
          <Input label="Your name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} error={errors.name} />
          <Input label="Firm" autoComplete="organization" value={firm} onChange={(e) => { setFirm(e.target.value); setErrors((x) => ({ ...x, firm: undefined })); }} error={errors.firm} />
          <div>
            <Checkbox checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: undefined })); }} aria-describedby={errors.consent ? "consent-error" : undefined}>
              I understand the role and the data I will process.
            </Checkbox>
            {errors.consent && (
              <p id="consent-error" className="mt-1 flex items-start gap-1.5 text-sm font-medium text-danger">
                <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
                {errors.consent}
              </p>
            )}
          </div>

          {IS_MOCK && (
            <p className="flex flex-wrap items-center gap-2 rounded-card bg-info-bg p-3 text-sm leading-5 text-info">
              <SimulatedPill />
              No real passkey is created in this demo. Your device will not ask for Face ID or a security key.
            </p>
          )}
          {failure && (
            <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
              <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
              {failure}
            </p>
          )}

          <Button type="submit" loading={busy} icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}>
            Create passkey and accept
          </Button>
        </AuthBody>
      </form>
    </>
  );
}
