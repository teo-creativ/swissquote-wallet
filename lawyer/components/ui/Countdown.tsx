"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { formatRemaining } from "@/lib/countdown";

type CountdownProps = {
  /** End of the delay, epoch milliseconds. */
  endsAt: number;
  /** Label before the time. Default from design.md L7: "Time left". */
  label?: string;
  className?: string;
};

/** Pill "Time left 02:40". Ticks every second; shows "Expired" at zero. Renders a placeholder until mounted (no hydration mismatch). */
export function Countdown({ endsAt, label = "Time left", className = "" }: CountdownProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left = now === null ? null : endsAt - now;
  const done = left !== null && left <= 0;
  return (
    <span
      role="timer"
      className={`inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-sm font-medium tabular-nums ${
        done ? "bg-surface text-muted" : "bg-warn-bg text-warn"
      } ${className}`}
    >
      <Timer size={16} strokeWidth={1.75} aria-hidden="true" />
      {done ? "Expired" : `${label} ${left === null ? "--:--" : formatRemaining(left)}`}
    </span>
  );
}
