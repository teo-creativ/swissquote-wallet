import { CopyField, DataTable, StatusChip } from "@/components/ui";
import type { Column } from "@/components/ui";
import { listClients } from "@/lib/console.mock";
import type { ClientStatus, ConsoleClient } from "@/lib/console.types";
import { ClientBadge } from "../chips";
import { PageTitle } from "../PageTitle";

const statusChip: Record<ClientStatus, React.ReactNode> = {
  active: <StatusChip status="verified">Active</StatusChip>,
  recovery_requested: <StatusChip status="pending">Recovery requested</StatusChip>,
  archived: <StatusChip status="neutral">Archived</StatusChip>,
};

const columns: Column<ConsoleClient>[] = [
  {
    key: "client",
    header: "Client",
    render: (c) => (
      <span className="flex items-center gap-3">
        <ClientBadge number={c.number} />
        <span className="font-mono text-[13px]">{c.id}</span>
      </span>
    ),
  },
  { key: "name", header: "Display name", render: (c) => <span className="font-semibold">{c.displayName}</span> },
  { key: "address", header: "Wallet address", render: (c) => <CopyField value={c.address} label={`Copy wallet address of ${c.displayName}`} /> },
  { key: "status", header: "Status", render: (c) => statusChip[c.status] },
  {
    key: "proof",
    header: "Ownership proof",
    render: (c) => (c.proofVerified ? <StatusChip status="verified">Verified</StatusChip> : <StatusChip status="failed">Not verified</StatusChip>),
  },
];

export default async function ClientsPage() {
  const clients = await listClients();
  return (
    <>
      <PageTitle title="Client wallets" count={`${clients.length} clients`} simulated />
      <DataTable caption="Client wallets" columns={columns} rows={clients} rowKey={(c) => c.id} />
    </>
  );
}
