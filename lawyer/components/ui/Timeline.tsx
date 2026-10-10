import { Check, Clock, X } from "lucide-react";
import type { ReactNode } from "react";

export type TimelineState = "done" | "current" | "todo" | "failed";

export type TimelineItem = {
  label: string;
  state: TimelineState;
  /** Shown on the left, e.g. "15:22". */
  time?: string;
  /** Extra block under the label: the countdown on the current step. */
  extra?: ReactNode;
};

const look: Record<TimelineState, { dot: string; icon: ReactNode; word: string }> = {
  done: { dot: "bg-ok-bg text-ok", icon: <Check size={14} strokeWidth={2} />, word: "Done" },
  current: { dot: "bg-info-bg text-info", icon: <Clock size={14} strokeWidth={2} />, word: "In progress" },
  failed: { dot: "bg-danger-bg text-danger", icon: <X size={14} strokeWidth={2} />, word: "Failed" },
  todo: { dot: "border border-line bg-white text-muted", icon: <span className="size-1.5 rounded-full bg-line" />, word: "Not started" },
};

/** Vertical steps with a status dot and a time (design.md L7). Status is also given in text for screen readers. */
export function Timeline({ items, label }: { items: TimelineItem[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {items.map((item, i) => {
        const { dot, icon, word } = look[item.state];
        const last = i === items.length - 1;
        return (
          <li key={item.label} aria-current={item.state === "current" ? "step" : undefined} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && <span aria-hidden="true" className="absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px bg-line" />}
            <span aria-hidden="true" className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full ${dot}`}>
              {icon}
            </span>
            <span className="w-14 shrink-0 pt-1 text-sm font-medium tabular-nums text-muted">{item.time ?? ""}</span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className={`text-base leading-6 ${item.state === "todo" ? "text-muted" : "text-ink"}`}>
                {item.label}
                <span className="sr-only">: {word}</span>
              </p>
              {item.extra && <div className="mt-2">{item.extra}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
