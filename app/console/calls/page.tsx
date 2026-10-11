import { DataTable, StatusChip } from "@/components/ui";
import type { Column } from "@/components/ui";
import { formatDateTime } from "@/lib/console.logic";
import { listCalls } from "@/lib/console.data";
import type { SimulatedCall } from "@/lib/console.types";
import { PageTitle } from "../PageTitle";

const columns: Column<SimulatedCall>[] = [
  { key: "when", header: "When", render: (c) => <span className="whitespace-nowrap text-muted">{formatDateTime(c.at)}</span> },
  { key: "client", header: "Client", render: (c) => <span className="font-mono text-[13px]">{c.clientId}</span> },
  { key: "phone", header: "Registered number", render: (c) => <span className="whitespace-nowrap font-mono text-[13px]">{c.phone}</span> },
  { key: "reason", header: "Reason", render: (c) => c.reason },
  {
    key: "result",
    header: "Result",
    render: (c) => (c.result === "Answered" ? <StatusChip status="verified">Answered</StatusChip> : <StatusChip status="warning">No answer</StatusChip>),
  },
];

export default async function CallsPage() {
  const calls = await listCalls();
  return (
    <>
      <PageTitle title="Calls" count={`${calls.length} calls`} simulated>
        Calls are simulated: nobody is actually phoned.
      </PageTitle>
      <DataTable caption="Simulated Swissquote calls to clients" columns={columns} rows={calls} rowKey={(c) => c.id} />
    </>
  );
}
