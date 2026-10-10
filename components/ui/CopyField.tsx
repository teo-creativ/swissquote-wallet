"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

type CopyFieldProps = {
  value: string;
  /** Visible text. Defaults to the value shortened as 0x9df4…88d4. */
  display?: string;
  /** Accessible name of the copy button, e.g. "Copy wallet address". */
  label?: string;
  className?: string;
};

export const shorten = (v: string, head = 6, tail = 4) => (v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`);

export function CopyField({ value, display, label = "Copy", className = "" }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context): the full value stays in the title attribute.
    }
  }
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span title={value} className="font-mono text-[13px] text-info">
        {display ?? shorten(value)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="relative z-10 flex size-6 items-center justify-center rounded-md text-muted before:absolute before:-inset-2 before:content-[''] hover:text-ink"
      >
        {copied ? <Check size={16} strokeWidth={1.75} className="text-ok" aria-hidden="true" /> : <Copy size={16} strokeWidth={1.75} aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}
