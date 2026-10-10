"use client";
import { Countdown, DataTable, useNow } from "@/components/ui";
import type { Column } from "@/components/ui";
import { deriveRecovery, formatDateTime } from "@/lib/console.logic";
import type { ConsoleClient, Recovery, RecoveryView } from "@/lib/console.types";
import { ClientBadge, CosignChip, IdentityChip, LawyerChip } from "../chips";

type Props = { recoveries: Recovery[]; clients: ConsoleClient[]; serverNow: number };

export function RecoveriesTable({ recoveries, clients, serverNow }: Props) {
  const now = useNow(serverNow);
  const rows = recoveries.map((r) => deriveRecovery(r, now));
  const client = (id: string) => clients.find((c) => c.id === id);

  const columns: Column<RecoveryView>[] = [
    {
      key: "client",
      header: "Client",
      render: (r) => {
        const c = client(r.clientId);
        return (
          <span className="flex items-center gap-3">
            <ClientBadge number={c?.number ?? "----"} tone={r.status === "blocked" ? "danger" : r.status === "completed" ? "neutral" : "info"} />
            <span className="font-semibold">Client {c?.number ?? r.clientId}</span>
          </span>
        );
      },
    },
    { key: "requested", header: "Requested at", render: (r) => <span className="whitespace-nowrap text-muted">{formatDateTime(r.createdAt)}</span> },
    { key: "identity", header: "Identity check", render: (r) => <IdentityChip state={r.identity} /> },
    { key: "lawyer", header: "Lawyer approval", render: (r) => <LawyerChip state={r.lawyer} /> },
    { key: "cosign", header: "Swissquote co-signature", render: (r) => <CosignChip signed={r.cosignedAt !== null} /> },
    {
      key: "left",
      header: "Time left",
      render: (r) => <Countdown variant="inline" msLeft={r.cosignedAt !== null ? null : r.msLeft} />,
    },
  ];

  return (
    <DataTable
      caption="Recovery requests"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => `/console/recoveries/${r.id}`}
      footer="Contestation window: 24 h in production (demo: 2 min)."
    />
  );
}
