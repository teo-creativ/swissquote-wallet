"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, Lock, Smartphone, User } from "lucide-react";
import { createWallet, getActivity } from "@/lib/sqkeys";
import type { WalletStep } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { shareStates } from "@/lib/onboarding";
import type { ShareState } from "@/lib/onboarding";
import { Banner, Button, CheckHalo, CopyField, PageShell, RowCard, SimulatedPill, Spinner, StatusChip, StepList } from "@/components/ui";
import type { Step } from "@/components/ui/StepList";
import { Guard } from "../_lib/Guard";
import { STEPS } from "../_lib/walletSteps";
import { isNotAuthenticated, messageOf } from "../_lib/errors";

const BASESCAN = "https://sepolia.basescan.org/address/";

function StateChip({ state }: { state: ShareState }) {
  if (state === "stored") return <StatusChip status="verified">Stored</StatusChip>;
  if (state === "generating") return <StatusChip status="info">Generating</StatusChip>;
  return <StatusChip status="neutral">Waiting</StatusChip>;
}

function ShareCard({ icon, title, where, state, simulated }: { icon: React.ReactNode; title: string; where: string; state: ShareState; simulated: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <RowCard leading={icon} title={title} subtitle={where} trailing={<StateChip state={state} />} />
      {simulated && (
        <div className="pl-1">
          <SimulatedPill />
        </div>
      )}
    </div>
  );
}

// C6. Three shares are created together: one per card. Step labels: annex F.2 (see _lib/walletSteps).
function Creating() {
  const router = useRouter();
  const [current, setCurrent] = useState<WalletStep | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setCurrent(null);
    try {
      const { address } = await createWallet(setCurrent);
      setAddress(address);
      if (!isMockMode) {
        // The real deployment transaction, paid by the sponsor. Failing to find it never blocks the screen.
        void getActivity().then((items) => setDeployUrl(items.find((i) => i.title === "Wallet created")?.explorerUrl ?? null), () => undefined);
      }
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice in dev
    started.current = true;
    void run();
  }, [run]);

  const states = shareStates(address ? "done" : current);
  const cards = (
    <div className="flex flex-col gap-3">
      <ShareCard icon={<Smartphone size={20} strokeWidth={1.75} />} title="You, on this phone" where="Encrypted on this phone. Face ID unlocks it." state={states.client} simulated={isMockMode} />
      <ShareCard icon={<User size={20} strokeWidth={1.75} />} title="Your lawyer" where="Kept on your lawyer's own server." state={states.lawyer} simulated={isMockMode} />
      <ShareCard icon={<Lock size={20} strokeWidth={1.75} />} title="Swissquote" where="Kept at Swissquote." state={states.swissquote} simulated={isMockMode} />
    </div>
  );

  if (address) {
    return (
      <PageShell
        footer={
          <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.replace("/home")}>
            Discover your wallet
          </Button>
        }
      >
        <div className="mt-6 flex flex-col items-center gap-4 text-center">
          <CheckHalo size={64} />
          <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">Your account is ready</h1>
          <p className="text-base leading-6 text-muted">
            {isMockMode
              ? "Your key now exists in three parts. No one holds the whole key, and any two parts can sign."
              : "Your wallet is a Safe smart account with three keys: one on this phone, one with your lawyer, one at Swissquote. Any two of them can approve a transaction."}
          </p>
        </div>
        <div className="mt-6">{cards}</div>
        <div className="mt-6 flex flex-col items-start gap-2">
          <span className="text-sm text-muted">Your wallet address (Base Sepolia, testnet)</span>
          <CopyField value={address} display={address} label="Copy wallet address" className="break-all" />
          <a href={`${BASESCAN}${address}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-info underline">
            View on Basescan <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </a>
          {deployUrl && (
            <a href={deployUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-info underline">
              Wallet creation transaction <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
            </a>
          )}
          {isMockMode && <SimulatedPill>Simulated wallet address</SimulatedPill>}
        </div>
      </PageShell>
    );
  }

  const at = current ? STEPS.findIndex((s) => s.id === current) : 0;
  const steps: Step[] = STEPS.map((s, i) => ({
    label: s.label,
    status: i < at ? "done" : i === at ? (error ? "error" : "active") : "todo",
  }));

  return (
    <PageShell
      title="Creating your wallet"
      subtitle={isMockMode ? "Your key is created in three parts, together. Swissquote pays the network fees." : "Three keys are created for your wallet, together. Swissquote pays the network fees."}
      footer={error ? <Button onClick={run}>Try again</Button> : undefined}
    >
      <div aria-live="polite">{cards}</div>
      <div className="mt-6">
        <StepList steps={steps} />
      </div>
      {error && <Banner variant="warning" className="mt-6">{error}</Banner>}
    </PageShell>
  );
}

export default function CreatingPage() {
  return <Guard route="/creating">{() => <Creating />}</Guard>;
}
