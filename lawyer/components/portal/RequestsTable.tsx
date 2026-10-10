"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StatusChip, Table } from "@/components/ui";
import type { TableColumn } from "@/components/ui";
import { formatAge, shortAddress } from "@/lib/format";
import { KIND_LABEL } from "@/lib/labels";
import type { RequestSummary } from "@/lib/lawyerApi.types";

/** Ages are computed against `now` so the whole table stays consistent between renders. */
export function RequestsTable({ rows, caption, now }: { rows: RequestSummary[]; caption: string; now: number }) {
  const columns: TableColumn<RequestSummary>[] = [
    { key: "client", header: "Client", render: (r) => <span className="font-medium">{r.clientName}</span> },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <>
          {KIND_LABEL[r.kind]}
          {r.to && <span className="block text-xs text-muted">to {shortAddress(r.to)}</span>}
        </>
      ),
      hideOnMobile: true,
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => (r.amount ? `${r.amount} USDC` : <span className="text-muted">-</span>),
      align: "right",
    },
    { key: "status", header: "Status", render: (r) => <StatusChip status={r.status} /> },
    { key: "age", header: "Requested", render: (r) => <span className="text-muted">{formatAge(r.createdAt, now)}</span>, hideOnMobile: true },
    {
      key: "open",
      header: "Open",
      render: (r) => (
        <Link
          href={`/requests/${encodeURIComponent(r.id)}`}
          className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-pill px-3 text-sm font-medium text-warn"
        >
          Open
          <span className="sr-only">
            {KIND_LABEL[r.kind].toLowerCase()} request from {r.clientName}
          </span>
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
        </Link>
      ),
      align: "right",
    },
  ];
  return <Table columns={columns} rows={rows} rowKey={(r) => r.id} caption={caption} />;
}
