"use client";

import { useEffect, useState } from "react";
import { formatUpdated } from "@/lib/format";

/** "Updated 3 s ago", ticking every second. Not a live region: it would be read out every second. */
export function UpdatedAgo({ at, className = "" }: { at: number | null; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className={`text-xs text-muted ${className}`}>{at === null ? "Updating…" : formatUpdated(at, now)}</span>;
}
