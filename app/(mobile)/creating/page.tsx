"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createWallet } from "@/lib/sqkeys";
import type { WalletStep } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, PageShell, StepList } from "@/components/ui";
import type { Step } from "@/components/ui/StepList";
import { Guard } from "../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../_lib/errors";

// C6. The 7 WalletStep values with the exact labels of annex F.2.
const STEPS: { id: WalletStep; label: string }[] = [
  { id: "preparing", label: "Preparing" },
  { id: "creating_keys", label: "Creating your key (nobody ever sees the whole key)" },
  { id: "checking_keys", label: "Checking the key" },
  { id: "saving_key_on_device", label: "Saving your part on this phone" },
  { id: "linking_wallet", label: "Linking your wallet to your Swissquote account" },
  { id: "funding_gas", label: "Adding network fees" },
  { id: "done", label: "Done" },
];

function Creating() {
  const router = useRouter();
  const [current, setCurrent] = useState<WalletStep | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setCurrent(null);
    try {
      await createWallet(setCurrent);
      setReady(true);
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

  if (ready) {
    return (
      <PageShell
        footer={
          <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.replace("/home")}>
            Discover your wallet
          </Button>
        }
      >
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-8 text-center">
          <CheckHalo size={64} />
          <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">Your account is ready</h1>
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
      subtitle="Swissquote pays the network fees."
      footer={error ? <Button onClick={run}>Try again</Button> : undefined}
    >
      <StepList steps={steps} />
      {error && <Banner variant="warning" className="mt-6">{error}</Banner>}
    </PageShell>
  );
}

export default function CreatingPage() {
  return <Guard route="/creating">{() => <Creating />}</Guard>;
}
