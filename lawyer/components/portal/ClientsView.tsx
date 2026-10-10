"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { Banner, Card, EmptyState, Spinner, StatusChip, Table } from "@/components/ui";
import type { TableColumn } from "@/components/ui";
import { getClients } from "@/lib/lawyerApi";
import type { ClientView } from "@/lib/lawyerApi.types";
import { shortAddress } from "@/lib/format";
import { UpdatedAgo } from "./UpdatedAgo";
import { usePolling } from "./usePolling";

const COLUMNS: TableColumn<ClientView>[] = [
  { key: "name", header: "Client", render: (c) => <span className="font-medium">{c.displayName}</span> },
  {
    key: "wallet",
    header: "Wallet",
    render: (c) => <span className="font-mono text-xs">{c.address ? shortAddress(c.address) : "Not created yet"}</span>,
    hideOnMobile: true,
  },
  {
    key: "status",
    header: "Status",
    render: (c) =>
      c.status === "recovering" ? (
        <StatusChip status="warning">Recovery running</StatusChip>
      ) : c.status === "invited" ? (
        <StatusChip status="pending">Invited</StatusChip>
      ) : c.pendingRequests > 0 ? (
        <StatusChip status="pending">{`${c.pendingRequests} pending`}</StatusChip>
      ) : (
        <StatusChip status="verified">Active</StatusChip>
      ),
  },
  { key: "version", header: "Policy", render: (c) => <span className="text-muted">v{c.policyVersion}</span>, hideOnMobile: true },
  {
    key: "open",
    header: "Open",
    align: "right",
    render: (c) => (
      <Link
        href={`/clients/${encodeURIComponent(c.id)}/policy`}
        className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-pill px-3 text-sm font-medium text-warn"
      >
        Policy
        <span className="sr-only"> of {c.displayName}</span>
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </Link>
    ),
  },
];

/** Entry point to L8: the clients this lawyer represents. */
export function ClientsView() {
  const load = useCallback(() => getClients(), []);
  const { data, error, updatedAt } = usePolling(load);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-9 text-ink">Clients</h1>
        <UpdatedAgo at={updatedAt} />
      </div>
      {error && !data && <Banner variant="warning">{error}</Banner>}
      <Card flush>
        {!data && !error ? (
          <div className="flex justify-center py-16">
            <Spinner label="Loading clients" />
          </div>
        ) : data && data.length === 0 ? (
          <EmptyState title="No clients yet." />
        ) : data ? (
          <Table columns={COLUMNS} rows={data} rowKey={(c) => c.id} caption="Clients you represent" />
        ) : null}
      </Card>
    </div>
  );
}
