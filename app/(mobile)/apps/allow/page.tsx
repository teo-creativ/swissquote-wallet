"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink } from "lucide-react";
import { approveApp, cancelTx, simulateApp, toBase } from "@/lib/sqkeys";
import type { TxView } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, Input, PageShell, Spinner } from "@/components/ui";
import { Guard } from "../../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../../_lib/errors";
import { AMOUNT_RE } from "../../_lib/send";

// Demo apps of the mock (D.1: approveApp / simulateApp). The last one is not on the list on purpose.
const APPS = [
  { id: "swap", label: "Demo Swap", spender: "0x00000000000000000000000000000000000d0001" },
  { id: "lend", label: "Demo Lend", spender: "0x00000000000000000000000000000000000d0002" },
  { id: "unknown", label: "Unknown app", spender: "0x7777777777777777777777777777777777778888" },
];

type Simulation = { appName: string | null; known: boolean; unlimited: boolean; plainText: string };
type Sim = { kind: "idle" } | { kind: "loading" } | { kind: "done"; sim: Simulation } | { kind: "error"; message: string };

const END_COPY: Record<string, string> = {
  refused: "Your lawyer declined this request. Nothing was allowed.",
  expired: "This request expired. Nothing was allowed.",
  cancelled: "Cancelled. Nothing was allowed.",
  failed: "Something went wrong. Nothing was sent. Try again.",
};

// C16. Texts: annex F.4. The plain-language sentence comes from simulateApp.
function AllowApp() {
  const router = useRouter();
  const [appId, setAppId] = useState("swap");
  const [amount, setAmount] = useState("3.00");
  const [anyAmount, setAnyAmount] = useState(false);
  const [sim, setSim] = useState<Sim>({ kind: "idle" });
  const [tx, setTx] = useState<TxView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const app = APPS.find((a) => a.id === appId) ?? APPS[0];
  const amountValid = AMOUNT_RE.test(amount) && BigInt(toBase(amount)) > 0n;
  const ready = anyAmount || amountValid;
  const value: string | "unlimited" = anyAmount ? "unlimited" : amount;

  useEffect(() => {
    const id = ++latest.current;
    if (!ready) {
      setSim({ kind: "idle" });
      return;
    }
    setSim({ kind: "loading" });
    const timer = setTimeout(async () => {
      try {
        const s = await simulateApp({ spender: app.spender, amountUsdc: value });
        if (id === latest.current) setSim({ kind: "done", sim: s });
      } catch (e) {
        if (isNotAuthenticated(e)) return router.replace("/login");
        if (id === latest.current) setSim({ kind: "error", message: messageOf(e) });
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      latest.current++;
    };
  }, [ready, app.spender, value, router]);

  async function allow() {
    setError(null);
    setSubmitting(true);
    try {
      await approveApp({ spender: app.spender, amountUsdc: value }, setTx);
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!tx) return;
    try {
      await cancelTx(tx.requestId);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  // After "Allow": follow the request on this screen until it ends.
  if (tx) {
    const done = tx.status === "confirmed";
    const ended = done || ["refused", "expired", "cancelled", "failed"].includes(tx.status);
    const waiting = tx.status === "pending_lawyer";
    return (
      <PageShell footer={ended ? <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.replace("/home")}>Back to home</Button> : waiting ? <Button variant="secondary" onClick={cancel}>Cancel</Button> : undefined}>
        <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-6 text-center">
          {done ? <CheckHalo size={64} /> : !ended && <Spinner size={72} label="Working" />}
          <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">
            {done ? "Allowed." : ended ? END_COPY[tx.status] : waiting ? "Waiting for your lawyer" : "Allowing the app…"}
          </h1>
          {waiting && <p className="text-base leading-6 text-muted">Your lawyer received the request. Nothing is allowed yet.</p>}
          {done && tx.explorerUrl && (
            <a href={tx.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-pill bg-surface px-6 text-base font-semibold text-ink">
              View on the explorer
              <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
        {error && <Banner variant="warning">{error}</Banner>}
      </PageShell>
    );
  }

  const warn = sim.kind === "done" && (sim.sim.unlimited || !sim.sim.known);
  return (
    <PageShell
      title="Allow this app?"
      backHref="/home"
      footer={
        <div className="flex flex-col gap-3">
          <Button loading={submitting} disabled={sim.kind !== "done"} onClick={allow}>Allow</Button>
          <Button variant="secondary" disabled={submitting} onClick={() => router.replace("/home")}>Cancel</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 px-1 text-sm font-medium text-ink">App</legend>
          <div className="flex flex-col gap-2">
            {APPS.map((a) => (
              <label key={a.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-card bg-surface px-4">
                <input type="radio" name="app" checked={appId === a.id} onChange={() => setAppId(a.id)} className="size-5 accent-brand" />
                <span className="text-base text-ink">{a.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Input
          label="Amount (USDC)"
          inputMode="decimal"
          autoComplete="off"
          disabled={anyAmount}
          value={anyAmount ? "" : amount}
          placeholder={anyAmount ? "Any amount" : "0.00"}
          error={!anyAmount && amount && !amountValid ? "Enter a valid amount." : undefined}
          onChange={(e) => setAmount(e.target.value.replace(",", "."))}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-1">
          <input type="checkbox" checked={anyAmount} onChange={(e) => setAnyAmount(e.target.checked)} className="size-5 accent-brand" />
          <span className="text-base text-ink">Allow any amount (not recommended)</span>
        </label>

        <div aria-live="polite">
          {sim.kind === "loading" && <p className="flex items-center gap-3 rounded-card bg-surface p-4 text-base text-muted"><Spinner size={20} label="" /> Checking…</p>}
          {sim.kind === "done" && (
            <Banner variant={warn ? "warning" : "info"} title={sim.sim.appName ?? "Unknown app"}>
              {sim.sim.plainText}
            </Banner>
          )}
          {sim.kind === "error" && <Banner variant="warning">{sim.message}</Banner>}
        </div>
        {error && <Banner variant="warning">{error}</Banner>}
      </div>
    </PageShell>
  );
}

export default function AllowAppPage() {
  return <Guard route="/apps/allow">{() => <AllowApp />}</Guard>;
}
