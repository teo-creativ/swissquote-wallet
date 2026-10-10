"use client";
import { useEffect, useState } from "react";

/** Current time, ticking every second. Starts at `initial` (the server's clock) so the first render matches the server HTML. */
export function useNow(initial: number, intervalMs = 1000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
