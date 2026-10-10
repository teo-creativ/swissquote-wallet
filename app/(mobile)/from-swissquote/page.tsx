"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, ShieldCheck } from "lucide-react";
import { getSwissquoteAccount, toBase, transferFromSwissquote } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, Input, PageShell, SimulatedPill } from "@/components/ui";
import { Guard } from "../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../_lib/errors";
import { AMOUNT_RE } from "../_lib/send";

const LIMIT_TEXT = "Limit: 10 USDC per transfer, 3 per day (demo).";
const MAX_BASE = 10_000_000n;

// C13. Texts: annex F.4.
function FromSwissquote() {
  const router = useRouter();
  const [cash, setCash] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ explorerUrl: string; amount: string } | null>(null);

  useEffect(() => {
    getSwissquoteAccount().then(
      (a) => setCash(a.cashChf),
      (e) => (isNotAuthenticated(e) ? router.replace("/login") : setError(messageOf(e))),
    );
  }, [router]);

  const complete = AMOUNT_RE.test(amount);
  const positive = complete && BigInt(toBase(amount)) > 0n;
  const overLimit = complete && BigInt(toBase(amount)) > MAX_BASE;
  const amountError = !amount
    ? undefined
    : !/^\d*\.?\d*$/.test(amount)
      ? "Enter a valid amount."
      : /\.\d{7,}$/.test(amount)
        ? "Use at most 6 decimals."
        : overLimit
          ? LIMIT_TEXT
          : undefined;

  async function transfer() {
    setError(null);
    setLoading(true);
    try {
      const { explorerUrl } = await transferFromSwissquote(amount);
      setDone({ explorerUrl, amount });
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <PageShell footer={<Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.replace("/home")}>Back to home</Button>}>
        <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-6 text-center">
          <CheckHalo size={64} />
          <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">{done.amount} USDC added to your wallet</h1>
          <a
            href={done.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center gap-2 rounded-pill bg-surface px-6 text-base font-semibold text-ink"
          >
            View on the explorer
            <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Transfer from your Swissquote account"
      backHref="/home"
      footer={
        <Button disabled={!positive || overLimit || cash === null} loading={loading} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={transfer}>
          Transfer
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-card bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">Swissquote account</p>
            <SimulatedPill />
          </div>
          <p className="mt-1 font-display text-[32px] font-semibold leading-9 text-ink">
            {cash === null ? "…" : `CHF ${cash}`}
          </p>
        </div>

        <Input
          label="Amount (USDC)"
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          error={amountError}
          hint={LIMIT_TEXT}
          onChange={(e) => setAmount(e.target.value.replace(",", "."))}
        />

        <p className="flex items-start gap-3 rounded-card bg-ok-bg p-4 text-sm leading-5 text-ok">
          <ShieldCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          Your wallet is verified as yours: you signed a proof of ownership.
        </p>

        {error && <Banner variant="warning">{error}</Banner>}
      </div>
    </PageShell>
  );
}

export default function FromSwissquotePage() {
  return <Guard route="/from-swissquote">{() => <FromSwissquote />}</Guard>;
}
