"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { continueRecoveryWallet, createRecoveryWallet, logout, verifyIdentity } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { SqKeysError } from "@/lib/sqkeys";
import type { WalletStep } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, Input, PageShell, SimulatedPill, StepList } from "@/components/ui";
import type { Step } from "@/components/ui/StepList";
import { Guard } from "../../../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../../../_lib/errors";
import { STEPS } from "../../../_lib/walletSteps";

const KYC = ["ID document", "Selfie", "Banking question"];
const STEP_MS = 800;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Phase = "form" | "checking" | "failed" | "key" | "wallet";

// C18 (identity check) then the new wallet of the recovery. Texts: annex F.2 (steps) and F.5 (failure).
function Verify({ id }: { id: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("form");
  const [answer, setAnswer] = useState("");
  const [kycIndex, setKycIndex] = useState(0);
  const [verified, setVerified] = useState(false);
  const [wallet, setWallet] = useState<WalletStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [needsSecondTap, setNeedsSecondTap] = useState(false);

  // Live: the passkey of the new phone must be created inside a tap, so this is called from a button, never from an await chain.
  function createWallet() {
    setPhase("wallet");
    setError(null);
    const work = needsSecondTap ? continueRecoveryWallet(id, setWallet) : createRecoveryWallet(id, setWallet);
    void work.then(() => router.replace(`/recovery/${id}`), (e: unknown) => {
      if (isNotAuthenticated(e)) return router.replace("/login");
      if (e instanceof SqKeysError && e.code === "SECOND_TAP_REQUIRED") {
        setNeedsSecondTap(true);
        setPhase("key");
        return;
      }
      setError(messageOf(e));
    });
  }

  async function verify() {
    setError(null);
    setPhase("checking");
    setVerified(false);
    // The result is known after one call; the steps are shown one by one so the check reads as a process.
    const result = verifyIdentity(id, { bankingAnswer: answer }).then((r) => r.verified, (e: unknown) => e);
    for (let i = 0; i < KYC.length; i++) {
      setKycIndex(i);
      await sleep(STEP_MS);
    }
    const outcome = await result;
    if (outcome === true) {
      setVerified(true);
      setKycIndex(KYC.length);
      await sleep(600);
      if (isMockMode) createWallet();
      else setPhase("key");
    } else if (outcome === false) {
      setPhase("failed");
    } else {
      if (isNotAuthenticated(outcome)) return router.replace("/login");
      setError(messageOf(outcome));
      setPhase("form");
    }
  }

  async function backToSignIn() {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  if (phase === "key") {
    return (
      <PageShell
        title={needsSecondTap ? "Confirm once more" : "Create your key on this phone"}
        subtitle="Your phone keeps your new key. Face ID, fingerprint or your device code unlocks it."
        footer={<Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={createWallet}>{needsSecondTap ? "Confirm once more" : "Create my new key"}</Button>}
      >
        <div className="flex items-center gap-4"><CheckHalo size={40} /><p className="text-base font-medium text-ink">You are verified (simulated).</p></div>
        {error && <Banner variant="warning" className="mt-6">{error}</Banner>}
      </PageShell>
    );
  }

  if (phase === "wallet") {
    const at = wallet ? STEPS.findIndex((s) => s.id === wallet) : 0;
    const steps: Step[] = STEPS.map((s, i) => ({ label: s.label, status: i < at ? "done" : i === at ? (error ? "error" : "active") : "todo" }));
    return (
      <PageShell title={isMockMode ? "Creating your wallet" : "Setting up your new key"} subtitle="Swissquote pays the network fees." footer={error ? <Button onClick={() => (isMockMode ? createWallet() : setPhase("key"))}>Try again</Button> : undefined}>
        <StepList steps={steps} />
        {error && <Banner variant="warning" className="mt-6">{error}</Banner>}
      </PageShell>
    );
  }

  const checking = phase === "checking";
  const failed = phase === "failed";
  const steps: Step[] = KYC.map((label, i) => ({
    label,
    status: failed ? (i < KYC.length - 1 ? "done" : "error") : checking ? (i < kycIndex ? "done" : i === kycIndex ? "active" : "todo") : "todo",
  }));

  return (
    <PageShell
      title="Verifying your identity"
      footer={
        failed ? (
          <div className="flex flex-col gap-3">
            <Button onClick={() => setPhase("form")}>Try again</Button>
            <Button variant="secondary" onClick={backToSignIn}>Back to sign in</Button>
          </div>
        ) : (
          <Button loading={checking} disabled={!answer.trim()} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={verify}>Verify</Button>
        )
      }
    >
      <div className="mb-4"><SimulatedPill>Simulated identity check</SimulatedPill></div>
      <StepList steps={steps} />
      {phase === "form" && (
        <Input className="mt-6" label="Answer to the banking question" autoComplete="off" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      )}
      <div aria-live="polite" className="mt-6">
        {verified && (
          <div className="flex items-center gap-4">
            <CheckHalo size={40} />
            <p className="text-base font-medium text-ink">You are verified (simulated).</p>
          </div>
        )}
        {failed && <Banner variant="warning">We could not verify your identity. Your lawyer was alerted.</Banner>}
        {error && <Banner variant="warning">{error}</Banner>}
      </div>
    </PageShell>
  );
}

export default function VerifyPage() {
  const { id } = useParams<{ id: string }>();
  return <Guard route="/recovery/verify">{() => <Verify id={id} />}</Guard>;
}
