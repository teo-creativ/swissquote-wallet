import { StatusChip } from "@/components/ui";
import type { IdentityState, LawyerState, RecoveryStatus } from "@/lib/console.types";

export function IdentityChip({ state }: { state: IdentityState }) {
  if (state === "verified") return <StatusChip status="verified" />;
  if (state === "failed") return <StatusChip status="failed" />;
  if (state === "pending") return <StatusChip status="pending" />;
  return <StatusChip status="neutral">Not requested</StatusChip>;
}

export function LawyerChip({ state }: { state: LawyerState }) {
  if (state === "approved") return <StatusChip status="verified">Approved</StatusChip>;
  if (state === "declined") return <StatusChip status="failed">Declined</StatusChip>;
  return <StatusChip status="pending" />;
}

export function CosignChip({ signed }: { signed: boolean }) {
  return signed ? <StatusChip status="verified">Signed</StatusChip> : <StatusChip status="neutral">Not signed</StatusChip>;
}

export function RecoveryStatusChip({ status }: { status: RecoveryStatus }) {
  switch (status) {
    case "completed":
      return <StatusChip status="verified">Completed</StatusChip>;
    case "in_progress":
      return <StatusChip status="info">In progress</StatusChip>;
    case "blocked":
      return <StatusChip status="failed">Blocked</StatusChip>;
    case "cancelled":
      return <StatusChip status="neutral">Cancelled</StatusChip>;
    default:
      return <StatusChip status="pending" />;
  }
}

/** Numbered badge of the mockup: tinted by state so a failed client stands out. */
export function ClientBadge({ number, tone = "info" }: { number: string; tone?: "info" | "danger" | "neutral" }) {
  const look = tone === "danger" ? "bg-danger-bg text-danger" : tone === "neutral" ? "bg-surface text-muted" : "bg-info-bg text-info";
  return (
    <span className={`inline-flex h-8 min-w-10 items-center justify-center rounded-lg px-2 font-mono text-xs font-semibold ${look}`}>
      {number}
    </span>
  );
}
