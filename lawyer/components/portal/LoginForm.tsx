"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Fingerprint } from "lucide-react";
import { Button, SimulatedPill } from "@/components/ui";
import { IS_MOCK, login } from "@/lib/lawyerApi";
import { AuthBody, AuthHero } from "./AuthCard";

/** L3. Only lawyers who already accepted an invitation can sign in (CDC 7.3). */
export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setFailure(null);
    try {
      await login();
      router.push("/dashboard");
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <AuthHero title="Sign in with your passkey" />
      <AuthBody>
        <p className="text-base leading-6 text-ink">
          Only lawyers who already accepted an invitation can sign in. If you have not, open the link your client sent you.
        </p>
        {IS_MOCK && (
          <p className="flex flex-wrap items-center gap-2 rounded-card bg-info-bg p-3 text-sm leading-5 text-info">
            <SimulatedPill />
            No real passkey is asked for in this demo.
          </p>
        )}
        {failure && (
          <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
            <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            {failure}
          </p>
        )}
        <Button loading={busy} onClick={signIn} icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}>
          Sign in
        </Button>
      </AuthBody>
    </>
  );
}
