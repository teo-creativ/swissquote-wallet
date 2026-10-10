"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";

type Tone = "ok" | "error";
type ToastItem = { id: number; message: string; tone: Tone };

const ToastContext = createContext<((message: string, tone?: Tone) => void) | null>(null);

const VISIBLE_MS = 6000;

/** Wrap the portal once. Toasts sit above the mobile tab bar, are announced politely and close after 6 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Tone = "ok") => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-2), { id, message, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), VISIBLE_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-40 flex flex-col items-center gap-2 md:bottom-6"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-card px-4 py-3 text-sm font-medium text-white shadow-float ${
              t.tone === "ok" ? "bg-ink" : "bg-danger"
            }`}
          >
            {t.tone === "ok" ? (
              <CircleCheck size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            ) : (
              <CircleAlert size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Close"
              className="-mr-2 -mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full"
            >
              <X size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, tone?: Tone) => void {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside ToastProvider");
  return toast;
}
