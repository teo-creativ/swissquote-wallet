"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const POLL_MS = 5000;

/**
 * Loads on mount, then every 5 s while the tab is visible (CDC 7.4). `load` must be stable (useCallback):
 * a new function resets the data and starts over, which is what a filter change needs.
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs: number = POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const alive = useRef(true);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    const mine = loadRef.current;
    try {
      const next = await mine();
      if (alive.current && mine === loadRef.current) {
        setData(next);
        setError(null);
        setUpdatedAt(Date.now());
      }
    } catch (e) {
      if (alive.current && mine === loadRef.current) setError(e instanceof Error && e.message ? e.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setData(null);
    setError(null);
    void refresh();
    const id = setInterval(() => {
      if (!document.hidden) void refresh();
    }, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
  }, [load, intervalMs, refresh]);

  return { data, error, updatedAt, refresh };
}
