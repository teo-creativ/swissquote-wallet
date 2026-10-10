"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ChevronRight, Fingerprint } from "lucide-react";
import { Banner, Button, Card, Checkbox, CopyField, Countdown, EmptyState, Spinner, StatusChip, useToast } from "@/components/ui";
import { decide, getRequest } from "@/lib/lawyerApi";
import type { RequestDetail } from "@/lib/lawyerApi.types";
import { formatAge, shortAddress, shortHash } from "@/lib/format";
import { REASON_LABEL } from "@/lib/labels";

import { UpdatedAgo } from "./UpdatedAgo";
import { usePolling } from "./usePolling";

const NOTE = "Your approval applies to this exact amount and recipient only.";

/** L6 for transfers. Recovery and exit requests get a read-only summary until L7 exists. */
export function RequestDetailView({ id }: { id: string }) {
  const load = useCallback(() => getRequest(id), [id]);
  const { data, error, updatedAt, refresh } = usePolling(load);

  if (!data) {
    return error ? (
      <div className="flex flex-col gap-4">
        <Banner variant="warning">{error}</Banner>
        <Link href="/requests" className="inline-flex min-h-11 items-center text-sm font-medium text-warn">
          Back to requests
        </Link>
      </div>
    ) : (
      <div className="flex justify-center py-16">
        <Spinner label="Loading the request" />
      </div>
    );
  }
  return data.kind === "transfer" ? (
    <TransferDetail request={data} updatedAt={updatedAt} refresh={refresh} />
  ) : (
    <OtherKindDetail request={data} updatedAt={updatedAt} />
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
      <Link href="/requests" className="inline-flex min-h-11 items-center rounded-pill pr-1 font-medium text-warn">
        Requests
      </Link>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      <span aria-current="page">{current}</span>
    </nav>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}

function TransferDetail({
  request: r,
  updatedAt,
  refresh,
}: {
  request: RequestDetail;
  updatedAt: number | null;
  refresh: () => Promise<void>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [addRecipient, setAddRecipient] = useState(true);
  const [busy, setBusy] = useState<"approve" | "refuse" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pending = r.status === "pending";
  const amount = `${r.amount} USDC`;
  const to = r.to ?? "";

  async function run(decision: "approve" | "refuse") {
    setBusy(decision);
    setProblem(null);
    const adding = decision === "approve" && addRecipient && !r.recipientKnown;
    try {
      await decide(r.id, decision, { addRecipient: adding });
      toast(
        decision === "approve"
          ? `Approved ${amount} to ${shortAddress(to)}.${adding ? " Recipient added to known recipients." : ""}`
          : "Declined. Nothing was sent.",
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

  const resultText =
    r.status === "approved"
      ? `You approved ${amount} to ${shortAddress(to)}.`
      : r.status === "refused"
        ? "You declined this request. Nothing was sent."
        : "This request expired. Nothing was sent.";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb current="Transfer request" />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-9 text-ink">Transfer request</h1>
          <StatusChip status={r.status} />
          {pending && <Countdown endsAt={Date.parse(r.expiresAt)} label="Expires in" />}
          <UpdatedAgo at={updatedAt} className="ml-auto" />
        </div>
      </div>

      <Banner variant="info">Your approval applies to this exact amount and recipient only. You can never move funds alone.</Banner>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Request">
          <dl>
            <Line label="Client">{r.clientName}</Line>
            <Line label="Amount">
              <span className="font-display text-xl font-semibold">{amount}</span>
            </Line>
            <Line label="Requested">{formatAge(r.createdAt)}</Line>
          </dl>

          <div className="mt-5 flex flex-col gap-5">
            <CopyField label="To" value={to} />

            <section aria-labelledby="why">
              <h3 id="why" className="mb-2 px-1 text-sm font-medium text-ink">
                Why it needs you
              </h3>
              <ul className="flex flex-wrap gap-2">
                {r.reasons.map((code) => (
                  <li key={code}>
                    <StatusChip status="warning">{REASON_LABEL[code]}</StatusChip>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="history">
              <h3 id="history" className="mb-2 px-1 text-sm font-medium text-ink">
                History with this recipient
              </h3>
              {r.recipientHistory.length === 0 ? (
                <p className="px-1 text-sm text-muted">No earlier request to this recipient.</p>
              ) : (
                <ul className="divide-y divide-line rounded-card border border-line">
                  {r.recipientHistory.map((h) => (
                    <li key={h.at} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="text-muted">{formatAge(h.at)}</span>
                      <span className="font-medium">{h.amount} USDC</span>
                      <StatusChip status={h.result} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <CopyField label="Intent hash" value={r.intentHash} display={shortHash(r.intentHash)} />
          </div>
        </Card>

        <Card title="Your limits for this client">
          <dl>
            <Line label="Per transfer">{r.limits.perTxCap} USDC</Line>
            <Line label="Per day">{r.limits.dailyCap} USDC</Line>
            <Line label="Transfers per hour">{r.limits.hourlyCount}</Line>
            <Line label="Transfers per day">{r.limits.dailyCount}</Line>
            <Line label="Unknown recipients need your approval">{r.limits.newRecipientRequiresLawyer ? "On" : "Off"}</Line>
          </dl>

          <div className="mt-5 flex flex-col gap-4">
            {pending ? (
              <>
                {r.recipientKnown ? (
                  <p className="px-1 text-sm text-muted">This recipient is already in the known recipients.</p>
                ) : (
                  <Checkbox checked={addRecipient} onChange={(e) => setAddRecipient(e.target.checked)} disabled={busy !== null}>
                    Add this recipient to known recipients
                  </Checkbox>
                )}

                <div className="flex flex-col gap-3">
                  <Button
                    loading={busy === "approve"}
                    disabled={busy === "refuse"}
                    onClick={() => run("approve")}
                    icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}
                  >
                    Approve with passkey
                  </Button>
                  <Button
                    variant="danger"
                    loading={busy === "refuse"}
                    disabled={busy === "approve"}
                    onClick={() => run("refuse")}
                    icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}
                  >
                    Decline with passkey
                  </Button>
                </div>

                {busy && (
                  <p role="status" className="rounded-card bg-info-bg p-3 text-sm leading-5 text-info">
                    {busy === "approve"
                      ? `You are approving ${amount} to ${shortAddress(to)}. Confirm with your passkey.`
                      : `You are declining ${amount} to ${shortAddress(to)}. Confirm with your passkey.`}
                  </p>
                )}
                {problem && <Banner variant="warning">{problem}</Banner>}
                <p className="px-1 text-xs text-muted">{NOTE}</p>
              </>
            ) : (
              <>
                <Banner variant="info">{resultText}</Banner>
                <Button variant="secondary" onClick={() => router.push("/requests")}>
                  Back to requests
                </Button>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Recovery and exit: read-only until the L7 screen is built. Texts: annex F.6. */
function OtherKindDetail({ request: r, updatedAt }: { request: RequestDetail; updatedAt: number | null }) {
  const isExit = r.kind === "exit";
  const title = isExit ? "Exit request without Swissquote" : "Recovery request";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb current={title} />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-9 text-ink">{title}</h1>
          <StatusChip status={r.status} />
          <UpdatedAgo at={updatedAt} className="ml-auto" />
        </div>
      </div>
      <Banner variant="warning">Contact the client by another channel (phone call) before approving.</Banner>
      <Card title={r.clientName}>
        {r.recovery ? (
          <div className="flex flex-col gap-4">
            <CopyField label="Old wallet" value={r.recovery.oldAddress} display={shortAddress(r.recovery.oldAddress)} />
            {isExit && r.to && <CopyField label="Destination address" value={r.to} display={shortAddress(r.to)} />}
            {!isExit && r.recovery.newAddress && (
              <CopyField label="New wallet" value={r.recovery.newAddress} display={shortAddress(r.recovery.newAddress)} />
            )}
          </div>
        ) : (
          <EmptyState title="No details available." />
        )}
        <p className="mt-5 text-xs text-muted">Approve, Decline and Cancel recovery arrive with the recovery screen (L7).</p>
      </Card>
    </div>
  );
}
