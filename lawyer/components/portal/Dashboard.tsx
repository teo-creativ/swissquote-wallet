"use client";

import Link from "next/link";
import { useCallback } from "react";
import { Bot, Inbox, Users } from "lucide-react";
import { Banner, Card, EmptyState, Spinner, Stat, StatusChip } from "@/components/ui";
import { getClients, getJournal, getRequests } from "@/lib/lawyerApi";
import { shortAddress } from "@/lib/format";
import { RequestsTable } from "./RequestsTable";
import { UpdatedAgo } from "./UpdatedAgo";
import { usePolling } from "./usePolling";

const LATEST = 5;

/** L4: clients, pending counter, last decisions. Refreshes every 5 s. */
export function Dashboard() {
  const load = useCallback(async () => {
    const [requests, clients, journal] = await Promise.all([getRequests(), getClients(), getJournal(1)]);
    return { requests, clients, auto: journal.autoDecisions24h };
  }, []);
  const { data, error, updatedAt } = usePolling(load);

  const now = Date.now();
  const pending = data?.requests.filter((r) => r.status === "pending") ?? [];
  const decided = data?.requests.filter((r) => r.status === "approved" || r.status === "refused").slice(0, LATEST) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-9 text-ink">Dashboard</h1>
        <UpdatedAgo at={updatedAt} />
      </div>

      {error && !data && <Banner variant="warning">{error}</Banner>}
      {!data && !error && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading the dashboard" />
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Pending requests" value={pending.length} note="waiting for you" icon={<Inbox size={20} strokeWidth={1.75} />} />
            <Stat label="Clients" value={data.clients.length} note="you represent" icon={<Users size={20} strokeWidth={1.75} />} />
            <Stat
              label="Automatic decisions"
              value={data.auto.count}
              note={`In the last 24 hours, total ${data.auto.totalUsdc} USDC`}
              icon={<Bot size={20} strokeWidth={1.75} />}
            />
          </div>

          <Card
            title="Waiting for you"
            flush
            action={
              <Link href="/requests" className="inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-medium text-warn">
                All requests
              </Link>
            }
          >
            {pending.length === 0 ? (
              <EmptyState />
            ) : (
              <RequestsTable rows={pending} caption="Requests waiting for you" now={now} />
            )}
          </Card>

          <Card title="Latest decisions" flush>
            {decided.length === 0 ? (
              <EmptyState title="No decisions yet." />
            ) : (
              <RequestsTable rows={decided} caption="Latest decisions" now={now} />
            )}
          </Card>

          <Card title="Clients">
            <ul className="divide-y divide-line">
              {data.clients.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{c.displayName}</p>
                    <p className="text-xs text-muted">{c.address ? shortAddress(c.address) : "Wallet not created yet"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.status === "recovering" && <StatusChip status="warning">Recovery running</StatusChip>}
                    {c.pendingRequests > 0 && <StatusChip status="pending">{`${c.pendingRequests} pending`}</StatusChip>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
      </>
      )}
    </div>
  );
}
