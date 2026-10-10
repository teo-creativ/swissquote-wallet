"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { registerAccount } from "@/lib/sqkeys";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legalVersion";
import { Banner, Button, PageShell, StatusChip } from "@/components/ui";
import { Guard } from "../_lib/Guard";
import { messageOf } from "../_lib/errors";
import { SESSION_KEYS, readSession, writeSession } from "../_lib/session";

const DOCUMENTS = [
  { id: "terms", label: "I accept the Terms of use", name: "Terms of use" },
  { id: "risk", label: "I have read the Risk warning", name: "Risk warning" },
  { id: "recovery", label: "I have read the Recovery terms", name: "Recovery terms" },
  { id: "privacy", label: "I have read the Privacy policy", name: "Privacy policy" },
] as const;

// C3. Four separate checkboxes, never pre-ticked. Texts: annex F.2.
function Documents() {
  const router = useRouter();
  // Ticks survive a visit to a legal page (the "Read" chips leave this screen).
  const [ticked, setTicked] = useState<boolean[]>(() => readSession(SESSION_KEYS.consents, [false, false, false, false]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(index: number) {
    const next = ticked.map((v, i) => (i === index ? !v : v));
    setTicked(next);
    writeSession(SESSION_KEYS.consents, next);
  }

  async function accept() {
    setError(null);
    setLoading(true);
    try {
      await registerAccount(DOCUMENTS.map((d) => ({ document: d.id, version: LEGAL_DOCUMENT_VERSION })));
      router.push("/lawyer");
    } catch (e) {
      setError(messageOf(e));
      setLoading(false);
    }
  }

  return (
    <PageShell
      title="Before we start"
      subtitle="Please read and accept each document. You can find them at any time under “Security.”"
      backHref="/verify"
      footer={
        <Button disabled={!ticked.every(Boolean)} loading={loading} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={accept}>
          Accept and continue
        </Button>
      }
    >
      <ul className="flex flex-col gap-3">
        {DOCUMENTS.map((doc, i) => (
          <li key={doc.id} className="flex items-center gap-2 rounded-card bg-surface pr-4">
            <label className="flex min-h-16 flex-1 cursor-pointer items-center gap-3 py-3 pl-4">
              <input type="checkbox" checked={ticked[i]} onChange={() => toggle(i)} className="size-6 shrink-0 accent-brand" />
              <span className="text-base leading-6 text-ink">{doc.label}</span>
            </label>
            <StatusChip status="read" ariaLabel={`Read the ${doc.name}`} onClick={() => router.push(`/legal/${doc.id}`)} />
          </li>
        ))}
      </ul>
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}
    </PageShell>
  );
}

export default function DocumentsPage() {
  return <Guard route="/documents">{() => <Documents />}</Guard>;
}
