"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { runKyc } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, PageShell, SimulatedPill, StepList } from "@/components/ui";
import type { Step } from "@/components/ui/StepList";
import { Guard } from "../_lib/Guard";
import { messageOf } from "../_lib/errors";

type KycStep = "document" | "selfie" | "banking_question";
const ORDER: { id: KycStep; label: string }[] = [
  { id: "document", label: "ID document" },
  { id: "selfie", label: "Selfie" },
  { id: "banking_question", label: "Banking question" },
];

// C2. Texts: annex F.2.
function Verify() {
  const router = useRouter();
  const [current, setCurrent] = useState<KycStep | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setError(null);
    setDone(false);
    setCurrent(null);
    try {
      await runKyc(setCurrent);
      setDone(true);
    } catch (e) {
      setError(messageOf(e));
    }
  }, []);

  useEffect(() => {
    if (started.current) return; // React strict mode runs effects twice in dev
    started.current = true;
    void run();
  }, [run]);

  const activeIndex = current ? ORDER.findIndex((s) => s.id === current) : -1;
  const steps: Step[] = ORDER.map((s, i) => ({
    label: s.label,
    status: done || i < activeIndex ? "done" : i === activeIndex ? (error ? "error" : "active") : "todo",
  }));

  return (
    <PageShell
      title="Verifying your identity"
      footer={
        error ? (
          <Button onClick={run}>Try again</Button>
        ) : (
          <Button disabled={!done} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.push("/documents")}>
            Continue
          </Button>
        )
      }
    >
      <div className="mb-4">
        <SimulatedPill>Simulated identity check</SimulatedPill>
      </div>
      <StepList steps={steps} />
      <div aria-live="polite" className="mt-6">
        {done && (
          <div className="flex items-center gap-4">
            <CheckHalo size={40} />
            <p className="text-base font-medium text-ink">You are verified (simulated).</p>
          </div>
        )}
        {error && <Banner variant="warning">{error}</Banner>}
      </div>
    </PageShell>
  );
}

export default function VerifyPage() {
  return <Guard route="/verify">{() => <Verify />}</Guard>;
}
