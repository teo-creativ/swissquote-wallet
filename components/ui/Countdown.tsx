import { Timer } from "lucide-react";
import { formatCountdown } from "@/lib/console.logic";

type CountdownProps = {
  /** Milliseconds left. Null = the delay has not started. The caller ticks it (see useNow). */
  msLeft: number | null;
  /** "pill": "Time left 02:40" in a grey pill (detail header). "inline": digits only (table cell). */
  variant?: "pill" | "inline";
  className?: string;
};

/** Monospace digits so the width does not jump every second. Shows "Elapsed" at zero and a dash before the delay starts. */
export function Countdown({ msLeft, variant = "pill", className = "" }: CountdownProps) {
  const digits = msLeft === null ? "--:--" : msLeft <= 0 ? "Elapsed" : formatCountdown(msLeft);
  const elapsed = msLeft !== null && msLeft <= 0;
  if (variant === "inline") {
    if (msLeft === null) return <span className={`text-muted ${className}`}>-</span>;
    return (
      <span className={`inline-flex items-center gap-1.5 font-mono text-sm font-semibold tabular-nums ${elapsed ? "text-ok" : "text-info"} ${className}`}>
        <Timer size={16} strokeWidth={1.75} aria-hidden="true" />
        {digits}
      </span>
    );
  }
  return (
    <div role="timer" className={`inline-flex items-center gap-2 rounded-card bg-line/60 px-4 py-2.5 ${className}`}>
      <Timer size={18} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
      <span className="text-sm font-medium text-muted">Time left</span>
      <span className={`font-mono text-2xl font-semibold tabular-nums ${elapsed ? "text-ok" : "text-info"}`}>{digits}</span>
    </div>
  );
}
