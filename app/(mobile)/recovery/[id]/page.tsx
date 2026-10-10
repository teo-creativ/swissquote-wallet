"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, Timer } from "lucide-react";
import { cancelRecovery, executeRecovery, getRecovery } from "@/lib/sqkeys";
import type { RecoveryView } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, PageShell, StepList } from "@/components/ui";
import type { Step } from "@/components/ui/StepList";
import { useNow } from "@/components/ui/useNow";
import { Guard } from "../../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../../_lib/errors";
import { shortAddress } from "../../_lib/send";

const POLL_MS = 2000;
const CLOSED = ["cancelled", "completed"];

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function timeline(view: RecoveryView, now: number): Step[] {
  const released = view.releaseAfter !== undefined && now >= Date.parse(view.releaseAfter);
  const completed = view.status === "completed";
  const ready = view.status === "ready";
  return [
    { label: "Identity verified", status: view.identityVerified ? "done" : "active" },
    {
      label: "Lawyer approval",
      status: view.lawyerStatus === "approved" ? "done" : view.lawyerStatus === "refused" ? "error" : view.identityVerified ? "active" : "todo",
    },
    { label: "Waiting period", status: !view.identityVerified ? "todo" : released ? "done" : "active" },
    { label: "Moving your funds", status: completed ? "done" : ready ? "active" : "todo" },
    { label: "Done", status: completed ? "done" : "todo" },
  ];
}

// C19. Texts: annex F.5 and F.1. "Cancel recovery" has the same size and weight as "Continue" (CDC 7.2).
function Track({ id }: { id: string }) {
  const router = useRouter();
  const now = useNow(Date.now());
  const [view, setView] = useState<RecoveryView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"continue" | "cancel" | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await getRecovery(id));
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
    }
  }, [id, router]);

  const closed = view !== null && CLOSED.includes(view.status);
  useEffect(() => {
    void refresh();
    if (closed) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, closed]);

  async function proceed() {
    setError(null);
    setBusy("continue");
    try {
      const { explorerUrl: url } = await executeRecovery(id);
      setExplorerUrl(url);
      await refresh();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setError(null);
    setBusy("cancel");
    try {
      await cancelRecovery(id);
      await refresh();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(null);
    }
  }

  const home = (
    <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.replace("/home")}>Back to home</Button>
  );

  if (!view) {
    return <PageShell title="Recovery">{error ? <Banner variant="warning">{error}</Banner> : <p className="text-base text-muted">Loading…</p>}</PageShell>;
  }

  if (view.status === "completed") {
    return (
      <PageShell footer={home}>
        <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-6 text-center">
          <CheckHalo size={64} />
          <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">Funds moved to your new wallet</h1>
          {view.newAddress && <p className="font-mono text-sm text-muted" title={view.newAddress}>{shortAddress(view.newAddress)}</p>}
          {explorerUrl && (
            <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-pill bg-surface px-6 text-base font-semibold text-ink">
              View on the explorer
              <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </PageShell>
    );
  }

  if (view.status === "cancelled") {
    return (
      <PageShell title="Recovery cancelled" footer={home}>
        <p className="text-base leading-6 text-muted">Nothing was moved. Your wallet stays as it is.</p>
      </PageShell>
    );
  }

  const releaseMs = view.releaseAfter !== undefined ? Date.parse(view.releaseAfter) - now : null;
  const failedIdentity = view.status === "identity_failed";
  const refused = view.lawyerStatus === "refused";
  const ready = view.status === "ready";

  return (
    <PageShell
      title="Recovery"
      footer={
        <div className="flex flex-col gap-3">
          {!failedIdentity && !refused && (
            <Button disabled={!ready || busy === "cancel"} loading={busy === "continue"} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={proceed}>Continue</Button>
          )}
          <Button variant="dark" loading={busy === "cancel"} disabled={busy === "continue"} onClick={cancel}>Cancel recovery</Button>
        </div>
      }
    >
      <Banner variant="demo" className="mb-4">Demo mode: recovery delay is 2 minutes. In production it would be 24 hours.</Banner>

      {failedIdentity ? (
        <Banner variant="warning">We could not verify your identity. Your lawyer was alerted.</Banner>
      ) : (
        <>
          <StepList steps={timeline(view, now)} />
          <div className="mt-6 flex flex-col gap-2 text-sm text-muted" aria-live="polite">
            {view.identityVerified && releaseMs !== null && (
              <p role="timer" className="flex items-center gap-2 text-base font-medium text-ink">
                <Timer size={20} strokeWidth={1.75} aria-hidden="true" />
                {releaseMs > 0 ? `Waiting period: ${mmss(releaseMs)} left` : "The waiting period is over."}
              </p>
            )}
            {refused && <p>Your lawyer declined the recovery. Nothing was moved.</p>}
            {!refused && view.identityVerified && view.lawyerStatus === "pending" && <p>Your lawyer must approve before your funds move.</p>}
            <p>Old wallet: <span className="font-mono" title={view.oldAddress}>{shortAddress(view.oldAddress)}</span></p>
            {view.newAddress && <p>New wallet: <span className="font-mono" title={view.newAddress}>{shortAddress(view.newAddress)}</span></p>}
          </div>
        </>
      )}
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}
    </PageShell>
  );
}

export default function TrackPage() {
  const { id } = useParams<{ id: string }>();
  return <Guard route="/recovery/track">{() => <Track id={id} />}</Guard>;
}
