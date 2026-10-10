"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button, PageShell } from "@/components/ui";

/** Full-screen stop for in-app browsers and webviews: passkeys do not work there, so we say so instead of failing. */
export function InAppBrowserGate({ browser }: { browser: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the address is shown below, selectable by hand.
    }
  }

  return (
    <PageShell
      footer={
        <Button variant="dark" icon={<Copy size={24} strokeWidth={1.75} />} onClick={copy}>
          {copied ? "Copied" : "Copy link"}
        </Button>
      }
    >
      <div className="mt-16 flex flex-col items-start gap-4">
        <ExternalLink size={40} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
        <h1 className="text-[28px] font-semibold leading-8 text-ink">Open this page in your browser</h1>
        <p className="text-base leading-6 text-muted">
          You are in {browser}. Passkeys do not work here. Copy the link, then open it in Safari (iPhone) or Chrome (Android).
        </p>
        <p className="break-all rounded-card bg-surface px-4 py-3 text-sm text-ink">{typeof location === "undefined" ? "" : location.href}</p>
      </div>
    </PageShell>
  );
}
