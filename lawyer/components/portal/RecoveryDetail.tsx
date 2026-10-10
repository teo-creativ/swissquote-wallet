"use client";

import { useState } from "react";
import { Fingerprint } from "lucide-react";
import { Banner, Button, Card, CopyField, Countdown, SimulatedPill, StatusChip, Timeline, useToast } from "@/components/ui";
import type { TimelineItem } from "@/components/ui";
import { formatDateTime, formatTime, shortAddress } from "@/lib/format";
import { decide } from "@/lib/lawyerApi";
import type { IdentityCheck, RequestDetail } from "@/lib/lawyerApi.types";
import { Breadcrumb, Line } from "./detailParts";
import { UpdatedAgo } from "./UpdatedAgo";
import { useNow } from "./useNow";

const IDENTITY: Record<IdentityCheck, { chip: "verified" | "pending" | "failed" }> = {
  verified: { chip: "verified" },
  pending: { chip: "pending" },
  failed: { chip: "failed" },
};

type Action = "approve" | "refuse" | "cancel";

/** L7: recovery (6.2) and exit (6.4) requests. Texts: annex F.5 and F.6. */
export function RecoveryDetail({
  request: r,
  updatedAt,
  refresh,
}: {
  request: RequestDetail;
  updatedAt: number | null;
  refresh: () => Promise<void>;
}) {
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState<Action | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const rec = r.recovery;
  const isExit = r.kind === "exit";
  const title = isExit ? "Exit request without Swissquote" : "Recovery request";
  const noun = isExit ? "exit" : "recovery";
  const destination = isExit ? r.to : rec?.newAddress;
  const identity = rec?.identity;

  const pending = r.status === "pending";
  const delayEndsAt = rec?.delayEndsAt ? Date.parse(rec.delayEndsAt) : null;
  const delayRunning = r.status === "approved" && delayEndsAt !== null && delayEndsAt > now;
  const identityBlocks = !isExit && identity !== "verified";

  const steps: TimelineItem[] = (rec?.timeline ?? []).map((s, i) => ({
    label: s.label,
    state: s.state,
    time: s.at ? formatTime(s.at).slice(0, 5) : undefined,
    extra:
      i === 2 && delayEndsAt !== null && s.state === "current" ? (
        <Countdown endsAt={delayEndsAt} doneLabel="Waiting period over" />
      ) : undefined,
  }));

  async function run(action: Action) {
    setBusy(action);
    setProblem(null);
    try {
      await decide(r.id, action === "approve" ? "approve" : "refuse");
      toast(
        action === "approve"
          ? "Approved. The waiting period has started."
          : action === "cancel"
            ? `${isExit ? "Exit" : "Recovery"} cancelled. Nothing was moved.`
            : "Declined. Nothing was moved.",
      );
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "Something went wrong. Try again.";
      setProblem(message);
      toast(message, "error");
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const target = destination ? shortAddress(destination) : "the new wallet";
  const sentence: Record<Action, string> = {
    approve: `You are approving the ${noun} for ${r.clientName}: all funds move to ${target} after the waiting period. Confirm with your passkey.`,
    refuse: `You are declining the ${noun} for ${r.clientName}. Nothing is moved. Confirm with your passkey.`,
    cancel: `You are cancelling the ${noun} for ${r.clientName} during the waiting period. Nothing is moved. Confirm with your passkey.`,
  };

  const cancelled = rec?.timeline[2]?.state === "failed";
  const resultText =
    r.status === "approved"
      ? "You approved this request. The waiting period is over."
      : r.status === "refused"
        ? cancelled
          ? `You cancelled this ${noun} during the waiting period. Nothing was moved.`
          : "You declined this request. Nothing was moved."
        : "This request expired. Nothing was moved.";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb current={title} />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-9 text-ink">{title}</h1>
          <StatusChip status={r.status} />
          {delayEndsAt !== null && r.status === "approved" ? (
            <Countdown endsAt={delayEndsAt} doneLabel="Waiting period over" className="ml-auto" />
          ) : pending ? (
            <Countdown endsAt={Date.parse(r.expiresAt)} label="Expires in" className="ml-auto" />
          ) : (
            <UpdatedAgo at={updatedAt} className="ml-auto" />
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {r.clientName} · {isExit ? "Exit" : "Recovery"} of {formatDateTime(r.createdAt)}
        </p>
      </div>

      <Banner variant="info">Your approval applies to this exact request only. You can never move funds alone.</Banner>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Timeline" action={<span className="text-xs font-medium uppercase tracking-wide text-muted">{steps.length} steps</span>}>
          {steps.length > 0 ? <Timeline items={steps} label={`${title} timeline`} /> : <p className="text-sm text-muted">No steps yet.</p>}
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <SimulatedPill>Simulated identity check</SimulatedPill>
            <span className="text-xs text-muted">Demo mode: recovery delay is 2 minutes. In production it would be 24 hours.</span>
          </div>
        </Card>

        <Card title={isExit ? "Exit details" : "Recovery details"}>
          <dl>
            {!isExit && identity && (
              <Line label="Identity check by Swissquote">
                <StatusChip status={IDENTITY[identity].chip} />
              </Line>
            )}
            <Line label="Waiting period ends">{rec?.delayEndsAt ? formatTime(rec.delayEndsAt) : "Starts when you approve"}</Line>
          </dl>

          <div className="mt-5 flex flex-col gap-5">
            {rec && <CopyField label="Old wallet" value={rec.oldAddress} display={shortAddress(rec.oldAddress)} />}
            {!isExit && rec?.newAddress && <CopyField label="New wallet" value={rec.newAddress} display={shortAddress(rec.newAddress)} />}
            {isExit && r.to && <CopyField label="Destination address" value={r.to} display={shortAddress(r.to)} />}

            {(pending || delayRunning) && (
              <Banner variant="warning">Contact the client by another channel (phone call) before approving.</Banner>
            )}
            {pending && identityBlocks && (
              <Banner variant="warning" title="Identity not verified">
                Swissquote has not verified this client's identity. You can only decline.
              </Banner>
            )}

            {pending ? (
              <div className="flex flex-col gap-3">
                <Button
                  loading={busy === "approve"}
                  disabled={busy === "refuse" || identityBlocks}
                  onClick={() => run("approve")}
                  icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}
                >
                  Approve
                </Button>
                <Button
                  variant="danger"
                  loading={busy === "refuse"}
                  disabled={busy === "approve"}
                  onClick={() => run("refuse")}
                  icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}
                >
                  Decline
                </Button>
              </div>
            ) : delayRunning ? (
              <Button
                variant="danger"
                loading={busy === "cancel"}
                onClick={() => run("cancel")}
                icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}
              >
                {isExit ? "Cancel exit" : "Cancel recovery"}
              </Button>
            ) : (
              <Banner variant="info">{resultText}</Banner>
            )}

            {busy && (
              <p role="status" className="rounded-card bg-info-bg p-3 text-sm leading-5 text-info">
                {sentence[busy]}
              </p>
            )}
            {problem && <Banner variant="warning">{problem}</Banner>}
          </div>
        </Card>
      </div>
    </div>
  );
}
