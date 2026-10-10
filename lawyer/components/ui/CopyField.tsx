"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyFieldProps = {
  label: string;
  value: string;
  /** Shown instead of the full value, e.g. a shortened hash. The full value is still copied. */
  display?: string;
  className?: string;
};

/** Read-only value with a 44px copy button. Announces "Copied" politely. */
export function CopyField({ label, value, display, className = "" }: CopyFieldProps) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={className}>
      <span id={id} className="mb-2 block px-1 text-sm font-medium text-ink">
        {label}
      </span>
      <div className="flex min-h-14 items-center gap-2 rounded-pill bg-surface py-1 pl-5 pr-1.5">
        <code aria-labelledby={id} className="min-w-0 flex-1 truncate font-mono text-sm text-ink" title={value}>
          {display ?? value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-ink transition-colors duration-200 ease-out"
        >
          {copied ? (
            <Check size={20} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Copy size={20} strokeWidth={1.75} aria-hidden="true" />
          )}
          <span className="sr-only">{copied ? "Copied" : `Copy ${label}`}</span>
        </button>
      </div>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </div>
  );
}
