import { DataTable, StatusChip } from "@/components/ui";
import type { Column } from "@/components/ui";
import { formatDateTime } from "@/lib/console.logic";
import { listAlerts } from "@/lib/console.data";
import type { AlertSeverity, ComplianceAlert } from "@/lib/console.types";
import { PageTitle } from "../PageTitle";

const severity: Record<AlertSeverity, React.ReactNode> = {
  info: <StatusChip status="info">Info</StatusChip>,
  warning: <StatusChip status="warning" />,
  critical: <StatusChip status="failed">Critical</StatusChip>,
};

const kind: Record<ComplianceAlert["kind"], string> = {
  sanctioned_transfer: "Refused transfer",
  recovery_requested: "Recovery requested",
  identity_failed: "Identity check failed",
  recovery_completed: "Recovery co-signed",
};

const columns: Column<ComplianceAlert>[] = [
  { key: "when", header: "When", render: (a) => <span className="whitespace-nowrap text-muted">{formatDateTime(a.at)}</span> },
  { key: "severity", header: "Severity", render: (a) => severity[a.severity] },
  { key: "type", header: "Type", render: (a) => <span className="whitespace-nowrap font-semibold">{kind[a.kind]}</span> },
  { key: "client", header: "Client", render: (a) => <span className="font-mono text-[13px]">{a.clientId}</span> },
  { key: "message", header: "Details", render: (a) => <span className="text-muted">{a.message}</span> },
];

export default async function AlertsPage() {
  const alerts = await listAlerts();
  return (
    <>
      <PageTitle title="Compliance alerts" count={`${alerts.length} alerts`} simulated />
      <DataTable caption="Compliance alerts" columns={columns} rows={alerts} rowKey={(a) => a.id} />
    </>
  );
}
