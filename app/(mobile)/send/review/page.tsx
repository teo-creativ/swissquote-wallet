"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { checkTransfer, sendUsdc } from "@/lib/sqkeys";
import type { TransferCheck, TxView } from "@/lib/sqkeys";
import { Banner, Button, PageShell, ReviewItem, Spinner } from "@/components/ui";
import { Guard } from "../../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../../_lib/errors";
import { ADDRESS_REASONS, reasonLines } from "../../_lib/reasons";
import { DRAFT_KEY, shortAddress } from "../../_lib/send";
import type { SendDraft } from "../../_lib/send";
import { clearSession, readSession } from "../../_lib/session";

// Face ID on Apple devices, fingerprint elsewhere (F.3 has both labels).
const biometric = () => (/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? "Face ID" : "fingerprint");

// C9. Texts: annex F.3 and the mockup (Result Overview, Address, Amount).
function Review({ draft }: { draft: SendDraft }) {
  const router = useRouter();
  const [check, setCheck] = useState<TransferCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [bio] = useState(biometric);
  const sent = useRef(false);

  // Fresh preview: limits may have moved since C8.
  useEffect(() => {
    let alive = true;
    checkTransfer({ to: draft.to, amountUsdc: draft.amountUsdc }).then(
      (c) => alive && setCheck(c),
      (e) => {
        if (isNotAuthenticated(e)) router.replace("/login");
        else if (alive) setError(messageOf(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [draft, router]);

  async function confirm() {
    if (sent.current) return;
    sent.current = true;
    setError(null);
    setSending(true);
    let navigated = false;
    try {
      // sendUsdc keeps running after we leave this page; the next screens follow the request with getTx.
      await sendUsdc({ to: draft.to, amountUsdc: draft.amountUsdc }, (tx: TxView) => {
        if (navigated) return;
        navigated = true;
        clearSession(DRAFT_KEY);
        router.replace(tx.outcome === "LAWYER" ? `/send/waiting/${tx.requestId}` : `/send/result/${tx.requestId}`);
      });
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
      setSending(false);
      sent.current = false;
    }
  }

  const addressReasons = check?.reasons.filter((r) => ADDRESS_REASONS.includes(r)) ?? [];
  const amountReasons = check?.reasons.filter((r) => !ADDRESS_REASONS.includes(r) && r !== "WITHIN_POLICY") ?? [];
  const refused = check?.outcome === "refused";
  const label =
    check?.outcome === "lawyer" ? "Ask my lawyer to review the transaction" : `Confirm with ${bio}`;

  return (
    <PageShell
      title="Review and confirm"
      backHref="/send"
      footer={
        <div className="flex flex-col gap-3">
          <Button
            loading={sending}
            disabled={!check || refused}
            trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />}
            onClick={confirm}
          >
            {label}
          </Button>
          <Button variant="secondary" disabled={sending} onClick={() => { clearSession(DRAFT_KEY); router.replace("/home"); }}>
            Cancel
          </Button>
        </div>
      }
    >
      <dl className="mb-4 flex flex-col gap-3 rounded-card bg-surface p-4">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-muted">You send</dt>
          <dd className="text-base font-semibold text-ink">{draft.amountUsdc} USDC</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-muted">To</dt>
          <dd className="font-mono text-sm text-ink" title={draft.to} aria-label={draft.to}>{shortAddress(draft.to)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-muted">Network fee</dt>
          <dd className="text-sm text-ink">Paid by Swissquote</dd>
        </div>
      </dl>

      {!check && !error && (
        <div className="flex justify-center py-10"><Spinner size={28} label="Checking" /></div>
      )}

      {check && (
        <div>
          <ReviewItem status="verified" title="Result Overview" description={`You are sending ${draft.amountUsdc} USDC.`} />
          <ReviewItem
            status={addressReasons.length ? "warning" : "verified"}
            title="Address"
            description={addressReasons.length ? reasonLines(addressReasons).join(" ") : "Known recipient."}
          />
          <ReviewItem
            status={amountReasons.length ? "warning" : "verified"}
            title="Amount"
            description={amountReasons.length ? reasonLines(amountReasons).join(" ") : "Below your limit."}
          />
        </div>
      )}

      {refused && <Banner variant="warning" className="mt-4">We can&apos;t process this transfer.</Banner>}
      {check?.outcome === "instant" && <p className="mt-4 text-sm text-muted">Instant: no approval needed. Signing needs {bio}.</p>}
      {check?.outcome === "lawyer" && <p className="mt-4 text-sm text-muted">Needs your lawyer&apos;s approval. Nothing is sent until they approve.</p>}
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}
    </PageShell>
  );
}

function WithDraft() {
  const router = useRouter();
  const [draft] = useState(() => readSession<SendDraft | null>(DRAFT_KEY, null));
  useEffect(() => {
    if (!draft) router.replace("/send");
  }, [draft, router]);
  return draft ? <Review draft={draft} /> : null;
}

export default function ReviewPage() {
  return <Guard route="/send/review">{() => <WithDraft />}</Guard>;
}
