import { BookOpen, CircleCheck, CircleDot, Clock, Minus, TriangleAlert, CircleX } from "lucide-react";
import type { ReactNode } from "react";

export type ChipStatus = "verified" | "warning" | "pending" | "read" | "failed" | "info" | "neutral";

const config: Record<ChipStatus, { label: string; look: string; icon: ReactNode }> = {
  verified: { label: "Verified", look: "bg-ok-bg text-ok", icon: <CircleCheck size={14} strokeWidth={1.75} /> },
  warning: { label: "Warning", look: "bg-warn-bg text-warn", icon: <TriangleAlert size={14} strokeWidth={1.75} /> },
  pending: { label: "Pending", look: "bg-warn-bg text-warn", icon: <Clock size={14} strokeWidth={1.75} /> },
  read: { label: "Read", look: "bg-warn-bg text-warn", icon: <BookOpen size={14} strokeWidth={1.75} /> },
  failed: { label: "Failed", look: "bg-danger-bg text-danger", icon: <CircleX size={14} strokeWidth={1.75} /> },
  info: { label: "In progress", look: "bg-info-bg text-info", icon: <CircleDot size={14} strokeWidth={1.75} /> },
  neutral: { label: "Not started", look: "bg-surface text-muted", icon: <Minus size={14} strokeWidth={1.75} /> },
};

type StatusChipProps = {
  status: ChipStatus;
  /** Overrides the default label ("Verified", "Warning"...). */
  children?: string;
  /** Makes the chip a button (e.g. "Read" opens the legal text). The touch target grows to 44px. */
  onClick?: () => void;
  /** Accessible name when several chips share the same text (e.g. "Read the Risk warning"). */
  ariaLabel?: string;
  className?: string;
};

/** Icon + text on every chip: status is never conveyed by color alone. */
export function StatusChip({ status, children, onClick, ariaLabel, className = "" }: StatusChipProps) {
  const { label, look, icon } = config[status];
  const base = `inline-flex h-6 shrink-0 items-center gap-1 rounded-pill px-2.5 text-[11px] font-medium leading-[14px] ${look} ${className}`;
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
        aria-label={ariaLabel}
        className={`${base} relative before:absolute before:-inset-2.5 before:content-['']`}
      >
        {content}
      </button>
    );
  }
  return <span className={base}>{content}</span>;
}
