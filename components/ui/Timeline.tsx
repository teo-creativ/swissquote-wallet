import { Check, Clock, X } from "lucide-react";
import type { ReactNode } from "react";

export type TimelineStatus = "done" | "failed" | "active" | "todo";

export type TimelineItem = {
  id: string;
  /** "15:20", or null while the step has not happened. */
  time: string | null;
  label: string;
  status: TimelineStatus;
  /** A StatusChip next to the label. */
  chip?: ReactNode;
  /** Extra block under the label, e.g. the secure countdown. */
  children?: ReactNode;
};

const statusText: Record<TimelineStatus, string> = { done: "Done", failed: "Failed", active: "In progress", todo: "Not started" };

function Dot({ status }: { status: TimelineStatus }) {
  const base = "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full";
  if (status === "done") return <span className={`${base} bg-ok-bg text-ok`}><Check size={16} strokeWidth={2} aria-hidden="true" /></span>;
  if (status === "failed") return <span className={`${base} bg-danger-bg text-danger`}><X size={16} strokeWidth={2} aria-hidden="true" /></span>;
  if (status === "active") return <span className={`${base} bg-info-bg text-info`}><Clock size={16} strokeWidth={2} aria-hidden="true" /></span>;
  return <span className={`${base} border border-line bg-white`}><span className="size-1.5 rounded-full bg-line" /></span>;
}

/** Vertical timeline. Each step carries icon + text, never color alone. */
export function Timeline({ items, className = "" }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={`flex flex-col ${className}`}>
      {items.map((it, i) => (
        <li key={it.id} aria-current={it.status === "active" ? "step" : undefined} className="relative flex gap-3 pb-6 last:pb-0">
          {i < items.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-3.5 top-7 w-px -translate-x-1/2 bg-line" />}
          <Dot status={it.status} />
          <span className={`w-12 shrink-0 pt-0.5 font-mono text-sm font-medium ${it.status === "active" ? "text-info" : "text-muted"}`}>{it.time ?? "--:--"}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className={`text-base ${it.status === "todo" ? "text-muted" : "text-ink"}`}>{it.label}</span>
              {it.chip}
              <span className="sr-only">{statusText[it.status]}</span>
            </div>
            {it.children}
          </div>
        </li>
      ))}
    </ol>
  );
}
