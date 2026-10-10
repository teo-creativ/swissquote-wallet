import { DataTable, StatusChip } from "@/components/ui";
import type { Column } from "@/components/ui";
import { formatDateTime } from "@/lib/console.logic";
import { listProofs } from "@/lib/console.mock";
import type { OwnershipProof } from "@/lib/console.types";
import { PageTitle } from "../PageTitle";

const columns: Column<OwnershipProof>[] = [
  { key: "client", header: "Client", render: (p) => <span className="font-mono text-[13px]">{p.clientId}</span> },
  { key: "message", header: "Signed message", render: (p) => <span className="block max-w-[320px] break-words text-[13px] text-muted">{p.message}</span> },
  { key: "signature", header: "Signature", render: (p) => <span className="font-mono text-[13px]">{p.signature}</span> },
  {
    key: "verified",
    header: "Verified",
    render: (p) => (p.verified ? <StatusChip status="verified">Yes (ECDSA)</StatusChip> : <StatusChip status="failed">No</StatusChip>),
  },
  { key: "date", header: "Date", render: (p) => <span className="whitespace-nowrap text-muted">{formatDateTime(p.at)}</span> },
];

export default async function ProofsPage() {
  const proofs = await listProofs();
  return (
    <>
      <PageTitle title="Ownership proofs" count={`${proofs.length} proofs`} simulated />
      <DataTable caption="Ownership proofs" columns={columns} rows={proofs} rowKey={(p) => p.id} />
    </>
  );
}
