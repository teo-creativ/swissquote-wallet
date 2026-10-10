"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CircleX, UserCheck, Zap } from "lucide-react";
import { checkTransfer, getBalance, toBase } from "@/lib/sqkeys";
import type { TransferCheck } from "@/lib/sqkeys";
import { Banner, Button, CoinIcon, Input, PageShell, Spinner } from "@/components/ui";
import { Guard } from "../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../_lib/errors";
import { reasonLines } from "../_lib/reasons";
import { ADDRESS_RE, AMOUNT_RE, DRAFT_KEY } from "../_lib/send";
import type { SendDraft } from "../_lib/send";
import { readSession, writeSession } from "../_lib/session";

type CheckState = { kind: "idle" } | { kind: "loading" } | { kind: "done"; check: TransferCheck } | { kind: "error"; message: string };

const DEBOUNCE_MS = 400;

function CheckResult({ check }: { check: TransferCheck }) {
  const lines = reasonLines(check.reasons);
  const look =
    check.outcome === "instant"
      ? { box: "bg-ok-bg text-ok", icon: <Zap size={20} strokeWidth={1.75} />, text: "Instant: no approval needed." }
      : check.outcome === "lawyer"
        ? { box: "bg-warn-bg text-warn", icon: <UserCheck size={20} strokeWidth={1.75} />, text: "Needs your lawyer's approval." }
        : { box: "bg-danger-bg text-danger", icon: <CircleX size={20} strokeWidth={1.75} />, text: "We can't process this transfer." };
  return (
    <div className={`rounded-card p-4 ${look.box}`}>
      <p className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden="true">{look.icon}</span>
        {look.text}
      </p>
      {check.outcome !== "instant" && lines.length > 0 && (
        <ul className="mt-2 list-disc pl-7 text-sm leading-5">
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </div>
  );
}

// C8. Texts: annex F.3.
function Send() {
  const router = useRouter();
  const [draft] = useState(() => readSession<SendDraft | null>(DRAFT_KEY, null));
  const [to, setTo] = useState(draft?.to ?? "");
  const [amount, setAmount] = useState(draft?.amountUsdc ?? "");
  const [touchedTo, setTouchedTo] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [state, setState] = useState<CheckState>({ kind: "idle" });
  const latest = useRef(0);

  useEffect(() => {
    getBalance().then((b) => setBalance(b.usdc), (e) => isNotAuthenticated(e) && router.replace("/login"));
  }, [router]);

  const address = to.trim();
  const addressValid = ADDRESS_RE.test(address);
  const amountComplete = AMOUNT_RE.test(amount);
  const tooLow = amountComplete && balance !== null && BigInt(toBase(amount)) > BigInt(toBase(balance));
  const positive = amountComplete && BigInt(toBase(amount)) > 0n;

  const addressError = address && (touchedTo || address.length >= 42) && !addressValid ? "Enter a valid address." : undefined;
  const amountError = !amount
    ? undefined
    : !/^\d*\.?\d*$/.test(amount)
      ? "Enter a valid amount."
      : /\.\d{7,}$/.test(amount)
        ? "Use at most 6 decimals."
        : tooLow
          ? "Your balance is too low for this transfer."
          : undefined;

  const checkable = addressValid && positive && !tooLow && balance !== null;

  // Live preview of the policy decision, 400 ms after the last keystroke (CDC 5.3 step 1).
  useEffect(() => {
    const id = ++latest.current;
    if (!checkable) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    const timer = setTimeout(async () => {
      try {
        const check = await checkTransfer({ to: address, amountUsdc: amount });
        if (id === latest.current) setState({ kind: "done", check });
      } catch (e) {
        if (isNotAuthenticated(e)) return router.replace("/login");
        if (id === latest.current) setState({ kind: "error", message: messageOf(e) });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      latest.current++;
    };
  }, [checkable, address, amount, router]);

  function review() {
    if (state.kind !== "done") return;
    writeSession(DRAFT_KEY, { to: address, amountUsdc: amount, check: state.check } satisfies SendDraft);
    router.push("/send/review");
  }

  async function paste() {
    try {
      setTo((await navigator.clipboard.readText()).trim());
      setTouchedTo(true);
    } catch {
      // Clipboard blocked: the user pastes by hand.
    }
  }

  const small = "h-11 shrink-0 rounded-pill bg-white px-4 text-sm font-semibold text-ink";

  return (
    <PageShell
      title="Send USDC"
      backHref="/home"
      footer={
        <Button disabled={state.kind !== "done" || state.check.outcome === "refused"} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={review}>
          Continue
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Input
          label="Recipient address"
          placeholder="0x…"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={to}
          error={addressError}
          onChange={(e) => setTo(e.target.value)}
          onBlur={() => setTouchedTo(true)}
          trailing={<button type="button" onClick={paste} className={small}>Paste</button>}
        />
        <Input
          label="Amount (USDC)"
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          error={amountError}
          hint={balance !== null ? `Available: ${balance} USDC` : "Loading your balance…"}
          onChange={(e) => setAmount(e.target.value.replace(",", "."))}
          trailing={
            <button type="button" disabled={balance === null || balance === "0.00"} onClick={() => balance && setAmount(balance)} className={`${small} disabled:text-muted`}>
              MAX
            </button>
          }
        />

        <div aria-live="polite">
          {state.kind === "loading" && (
            <p className="flex items-center gap-3 rounded-card bg-surface p-4 text-base text-muted">
              <Spinner size={20} label="" /> Checking…
            </p>
          )}
          {state.kind === "done" && <CheckResult check={state.check} />}
          {state.kind === "error" && <Banner variant="warning">{state.message}</Banner>}
        </div>

        <div className="flex items-center gap-3 rounded-card bg-surface px-4 py-3">
          <CoinIcon coin="eth" size={28} />
          <p className="text-sm text-ink">Network fee: paid by Swissquote</p>
        </div>
      </div>
    </PageShell>
  );
}

export default function SendPage() {
  return <Guard route="/send">{() => <Send />}</Guard>;
}
