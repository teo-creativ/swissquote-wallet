"use client";
import { Ban, CheckCircle2, CircleCheck, CircleX, FlaskConical, History, Hourglass, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Banner, Button, Countdown, CopyField, SimulatedPill, StatusChip, Timeline, useNow } from "@/components/ui";
import type { TimelineItem } from "@/components/ui";
import { deriveRecovery, formatDateTime, formatTime } from "@/lib/console.logic";
import type { ConsoleClient, IdentityOutcome, Recovery } from "@/lib/console.types";
import { cosignReleaseAction, sendIdentityCheckAction, setNextIdentityOutcomeAction } from "../../actions";
import type { ActionResult } from "../../actions";
import { IdentityChip, RecoveryStatusChip } from "../../chips";

type Props = { initialRecovery: Recovery; initialClient: ConsoleClient; serverNow: number };

const card = "overflow-hidden rounded-card border border-line bg-white";
const cardHeader = "flex items-center gap-3 border-b border-line bg-[#FAFBFC] px-6 py-4";

function CardTitle({ icon, title, subtitle, aside }: { icon: React.ReactNode; title: string; subtitle: string; aside?: React.ReactNode }) {
  return (
    <div className={cardHeader}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-line/60 text-muted" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold leading-6">{title}</h2>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{subtitle}</p>
      </div>
      {aside}
    </div>
  );
}

/** The demo switch of CDC 6.3: sets the result of the next identity check for this client. Big on purpose. */
function OutcomeSwitch({ value, onChange, busy, clientName }: { value: IdentityOutcome; onChange: (o: IdentityOutcome) => void; busy: boolean; clientName: string }) {
  const options: { id: IdentityOutcome; label: string; icon: React.ReactNode; on: string }[] = [
    { id: "pass", label: "PASS", icon: <CircleCheck size={22} strokeWidth={2} aria-hidden="true" />, on: "bg-ok text-white" },
    { id: "fail", label: "FAIL", icon: <CircleX size={22} strokeWidth={2} aria-hidden="true" />, on: "bg-danger text-white" },
  ];
  return (
    <div className="rounded-card border-2 border-dashed border-brand bg-brand-tint p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <FlaskConical size={18} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
          Demo switch
        </p>
        <SimulatedPill />
      </div>
      <p id="outcome-label" className="mt-2 text-base font-semibold">
        Next identity check for {clientName}: <span className={value === "pass" ? "text-ok" : "text-danger"}>{value === "pass" ? "PASS" : "FAIL"}</span>
      </p>
      <div role="radiogroup" aria-labelledby="outcome-label" className="mt-3 grid grid-cols-2 gap-2">
        {options.map((o) => {
          const selected = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={busy}
              onClick={() => !selected && onChange(o.id)}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-pill text-lg font-bold tracking-wide transition-colors ${
                selected ? o.on : "border border-line bg-white text-muted hover:text-ink"
              }`}
            >
              {o.icon}
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">Applies when the check is sent. A check already sent keeps its result.</p>
    </div>
  );
}

function StepHeading({ n, children }: { n: number; children: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
      <span className="flex size-5 items-center justify-center rounded-full bg-ink text-[11px] text-white">{n}</span>
      {children}
    </p>
  );
}

export function RecoveryDetail({ initialRecovery, initialClient, serverNow }: Props) {
  const [recovery, setRecovery] = useState(initialRecovery);
  const [client, setClient] = useState(initialClient);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const now = useNow(serverNow);
  const v = deriveRecovery(recovery, now);

  function run<T>(action: () => Promise<ActionResult<T>>, apply: (value: T) => void) {
    setError(null);
    start(async () => {
      const res = await action();
      if (res.ok) apply(res.value);
      else setError(res.error);
    });
  }

  const sent = recovery.identityRequestedAt !== null;
  const done = recovery.cosignedAt !== null;
  const delayStarted = v.releaseAfter !== null;

  const items: TimelineItem[] = [
    { id: "created", time: formatTime(v.createdAt), label: "Request created from a new device", status: "done" },
    {
      id: "identity",
      time: sent ? formatTime(v.identityVerifiedAt ?? v.identityFailedAt ?? (recovery.identityRequestedAt as number)) : null,
      label: "Identity check (simulated)",
      status: v.identity === "verified" ? "done" : v.identity === "failed" ? "failed" : v.identity === "pending" ? "active" : "todo",
      chip: sent ? <IdentityChip state={v.identity} /> : undefined,
    },
    {
      id: "lawyer",
      time: v.lawyerApprovedAt ? formatTime(v.lawyerApprovedAt) : null,
      label: "Lawyer approval",
      status: v.lawyer === "approved" ? "done" : v.lawyer === "declined" ? "failed" : v.identity === "verified" ? "active" : "todo",
    },
    {
      id: "cosign",
      time: done ? formatTime(recovery.cosignedAt as number) : null,
      label: "Swissquote co-signature",
      status: done ? "done" : v.canCosign ? "active" : "todo",
      chip: done ? <StatusChip status="verified">Signed</StatusChip> : undefined,
    },
    {
      id: "delay",
      time: delayStarted ? formatTime(v.identityVerifiedAt as number) : null,
      label: delayStarted
        ? `Safety delay started: ends at ${formatTime(v.releaseAfter as number)} (24 h in production)`
        : "Safety delay starts once the identity is verified",
      status: !delayStarted ? "todo" : v.delayElapsed ? "done" : "active",
      children: delayStarted ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-info-bg px-4 py-3 text-info">
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <Hourglass size={16} strokeWidth={1.75} aria-hidden="true" />
            Secure countdown
          </span>
          <span className="text-base">
            <Countdown variant="inline" msLeft={v.msLeft} />
          </span>
        </div>
      ) : undefined,
    },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/console/recoveries" className="hover:text-ink">
          Recoveries
        </Link>
        <span className="mx-2 text-line" aria-hidden="true">
          /
        </span>
        <span aria-current="page" className="font-semibold text-ink">
          Client {client.number}
        </span>
      </nav>

      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold leading-9">Recovery of {formatDateTime(v.createdAt)}</h1>
        <RecoveryStatusChip status={v.status} />
        <Countdown className="ml-auto" msLeft={done ? null : v.msLeft} />
      </div>

      {error && (
        <Banner variant="warning" title="Action refused" className="mb-6">
          {error}
        </Banner>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="timeline-title" className={card}>
          <CardTitle
            icon={<History size={20} strokeWidth={1.75} />}
            title="Timeline"
            subtitle="2-of-3 owner approval"
            aside={<span className="text-[11px] font-semibold uppercase tracking-wider text-muted">5 steps</span>}
          />
          <h2 id="timeline-title" className="sr-only">
            Timeline
          </h2>
          <div className="p-6">
            <Timeline items={items} />
          </div>
          <div className="mx-6 mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-info-bg px-4 py-3 text-sm">
            <span className="text-muted">Linked cryptographic proof:</span>
            <CopyField value={recovery.proofHash} label="Copy proof hash" display={`${recovery.proofHash.slice(0, 6)}…${recovery.proofHash.slice(-12)}`} />
          </div>
        </section>

        <section className={card}>
          <CardTitle
            icon={<ShieldCheck size={20} strokeWidth={1.75} />}
            title="Swissquote action"
            subtitle="Co-signature after identity check"
            aside={<SimulatedPill />}
          />
          <div className="flex flex-col gap-5 p-6">
            <p className="text-base leading-6">Swissquote&apos;s only possible action is to co-sign after a successful identity check.</p>

            <OutcomeSwitch
              value={client.nextIdentityOutcome}
              clientName={client.displayName}
              busy={pending}
              onChange={(o) => run(() => setNextIdentityOutcomeAction(client.id, o), setClient)}
            />

            <div>
              <StepHeading n={1}>Send identity check</StepHeading>
              <Button
                variant={sent ? "secondary" : "primary"}
                icon={<Send size={20} strokeWidth={1.75} aria-hidden="true" />}
                disabled={sent || v.status === "cancelled"}
                loading={pending && !sent}
                onClick={() => run(() => sendIdentityCheckAction(recovery.id), setRecovery)}
              >
                {sent ? `Identity check sent at ${formatTime(recovery.identityRequestedAt as number)}` : "Send identity check"}
              </Button>
              {!sent && <p className="mt-2 text-xs text-muted">The client&apos;s app shows the identity check screen. The check itself is simulated.</p>}
            </div>

            <div>
              <StepHeading n={2}>Identity result</StepHeading>
              <div aria-live="polite" className="flex items-center gap-3 rounded-card bg-surface px-4 py-3">
                <IdentityChip state={v.identity} />
                <span className="text-sm text-muted">
                  {v.identity === "not_requested" && "Waiting for you to send the check."}
                  {v.identity === "pending" && "The client is going through the check."}
                  {v.identity === "verified" && "Identity verified. The lawyer and the safety delay come next."}
                  {v.identity === "failed" && "Identity not verified. The recovery is blocked and the lawyer was alerted."}
                </span>
              </div>
            </div>

            <div>
              <StepHeading n={3}>Co-sign the recovery</StepHeading>
              {done ? (
                <div className="flex min-h-14 items-center justify-center gap-2 rounded-pill bg-ok-bg text-lg font-semibold text-ok">
                  <CheckCircle2 size={22} strokeWidth={1.75} aria-hidden="true" />
                  Co-signed at {formatTime(recovery.cosignedAt as number)}
                </div>
              ) : (
                <>
                  <Button
                    icon={v.canCosign ? undefined : <Ban size={20} strokeWidth={1.75} aria-hidden="true" />}
                    disabled={!v.canCosign}
                    loading={pending && v.canCosign}
                    aria-describedby="cosign-reason"
                    onClick={() => run(() => cosignReleaseAction(recovery.id), setRecovery)}
                  >
                    Co-sign the recovery
                  </Button>
                  <p id="cosign-reason" className="mt-2 flex items-start gap-1.5 text-sm text-muted">
                    {v.cosignBlockedReason ?? "All conditions are met: identity verified, lawyer approved, safety delay elapsed."}
                  </p>
                </>
              )}
            </div>

            <p className="text-sm leading-5 text-muted">Swissquote cannot finish, cancel, or move the funds alone.</p>

            <div className="rounded-card bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Owner key</h3>
                {done ? <StatusChip status="verified">Signed and locked</StatusChip> : <StatusChip status="neutral">Not signed</StatusChip>}
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-white p-3 font-mono text-xs">
                <dt className="text-muted">Party</dt>
                <dd className="text-right">P3 (Swissquote)</dd>
                <dt className="text-muted">Algorithm</dt>
                <dd className="text-right">Safe owner key · ECDSA secp256k1</dd>
                <dt className="text-muted">Operator</dt>
                <dd className="text-right">SQ-CH-NODE-04 (simulated)</dd>
                <dt className="text-muted">Timestamp</dt>
                <dd className="text-right">{done ? new Date(recovery.cosignedAt as number).toISOString() : "-"}</dd>
              </dl>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
