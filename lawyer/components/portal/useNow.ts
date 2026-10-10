"use client";

import { useEffect, useState } from "react";

/** Current time in ms, re-rendered every `intervalMs`. Starts at 0 on the server pass so markup never mismatches. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
