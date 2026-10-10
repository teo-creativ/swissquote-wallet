import { BookOpen, CircleCheck, CircleX, Clock, Hourglass, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type ChipStatus = "verified" | "warning" | "pending" | "read" | "failed" | "approved" | "refused" | "expired";

const config: Record<ChipStatus, { label: string; look: string; icon: ReactNode }> = {
  verified: { label: "Verified", look: "bg-ok-bg text-ok", icon: <CircleCheck size={14} strokeWidth={1.75} /> },
  warning: { label: "Warning", look: "bg-warn-bg text-warn", icon: <TriangleAlert size={14} strokeWidth={1.75} /> },
  pending: { label: "Pending", look: "bg-warn-bg text-warn", icon: <Clock size={14} strokeWidth={1.75} /> },
  read: { label: "Read", look: "bg-warn-bg text-warn", icon: <BookOpen size={14} strokeWidth={1.75} /> },
  failed: { label: "Failed", look: "bg-danger-bg text-danger", icon: <CircleX size={14} strokeWidth={1.75} /> },
  // Request outcomes (lawyer portal L5).
  approved: { label: "Approved", look: "bg-ok-bg text-ok", icon: <CircleCheck size={14} strokeWidth={1.75} /> },
  refused: { label: "Refused", look: "bg-danger-bg text-danger", icon: <CircleX size={14} strokeWidth={1.75} /> },
  expired: { label: "Expired", look: "bg-surface text-muted", icon: <Hourglass size={14} strokeWidth={1.75} /> },
};

type StatusChipProps = {
  status: ChipStatus;
  /** Overrides the default label ("Verified", "Warning"...). */
  children?: string;
  /** Makes the chip a button (e.g. "Read" opens the legal text). The touch target grows to 44px. */
  onClick?: () => void;
  /** "md" for a chip that carries the main message of a card, e.g. the journal integrity badge. */
  size?: "sm" | "md";
  className?: string;
};

const dims = { sm: "h-6 px-2.5 text-[11px] leading-[14px]", md: "h-8 px-3.5 text-sm leading-5" } as const;

/** Icon + text on every chip: status is never conveyed by color alone. */
export function StatusChip({ status, children, onClick, size = "sm", className = "" }: StatusChipProps) {
  const { label, look, icon } = config[status];
  const base = `inline-flex shrink-0 items-center gap-1 rounded-pill font-medium ${dims[size]} ${look} ${className}`;
  const content = (
    <>
      <span aria-hidden="true">{icon}</span>
      {children ?? label}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} relative before:absolute before:-inset-2.5 before:content-['']`}
      >
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}
