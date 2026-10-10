"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Ban, ChevronRight, Clock, ExternalLink, TriangleAlert, X } from "lucide-react";
import { getActivity, getTx } from "@/lib/sqkeys";
import type { ActivityItem, TxView } from "@/lib/sqkeys";
import { Banner, Button, CheckHalo, PageShell, Spinner } from "@/components/ui";
import { Guard } from "../../../_lib/Guard";
import { GENERIC_ERROR, isNotAuthenticated, messageOf } from "../../../_lib/errors";
import { reasonLines } from "../../../_lib/reasons";
import { isFinished, shortAddress } from "../../../_lib/send";

const POLL_MS = 1000;

function Halo({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="inline-flex size-16 items-center justify-center rounded-full bg-danger-bg text-danger">
      {children}
    </span>
  );
}

/** Headline and body of each end state (annex F.3, F.1 for the rest). */
function outcomeCopy(tx: TxView): { icon: ReactNode; title: string; body?: string } {
  switch (tx.status) {
    case "confirmed":
      return { icon: <CheckHalo size={64} />, title: "Sent. View on the explorer." };
    case "refused":
      return tx.outcome === "LAWYER"
        ? { icon: <Halo><X size={32} strokeWidth={2} /></Halo>, title: "Your lawyer declined this transfer. Nothing was sent." }
        : { icon: <Halo><Ban size={32} strokeWidth={1.75} /></Halo>, title: "We can't process this transfer.", body: reasonLines(tx.reasons).join(" ") };
    case "expired":
      return { icon: <Halo><Clock size={32} strokeWidth={1.75} /></Halo>, title: "This request expired. Nothing was sent." };
    case "cancelled":
      return { icon: <Halo><X size={32} strokeWidth={2} /></Halo>, title: "Cancelled. Nothing was sent." };
    default:
      return { icon: <Halo><TriangleAlert size={32} strokeWidth={1.75} /></Halo>, title: GENERIC_ERROR };
  }
}

// C11. Follows the request until it ends: instant transfers land here straight from C9.
function Result({ id }: { id: string }) {
  const router = useRouter();
  const [tx, setTx] = useState<TxView | null>(null);
  const [item, setItem] = useState<ActivityItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await getTx(id);
        if (!alive) return;
        setTx(next);
        if (isFinished(next.status)) return;
      } catch (e) {
        if (isNotAuthenticated(e)) return router.replace("/login");
        if (alive) setError(messageOf(e));
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, router]);

  // Amount and recipient are not part of TxView: the activity log has them.
  const finished = tx ? isFinished(tx.status) : false;
  useEffect(() => {
    if (!finished) return;
    getActivity().then((list) => setItem(list.find((a) => a.id === id) ?? null), () => undefined);
  }, [finished, id]);

  const home = (
    <Button trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={() => router.replace("/home")}>
      Back to home
    </Button>
  );

  if (error) {
    return (
      <PageShell footer={home}>
        <Banner variant="warning" className="mt-10">{error}</Banner>
      </PageShell>
    );
  }

  if (!tx || !finished) {
    return (
      <PageShell>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
          <Spinner size={72} label="Sending" />
          <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">Sending your transfer</h1>
        </div>
      </PageShell>
    );
  }

  const { icon, title, body } = outcomeCopy(tx);
  return (
    <PageShell footer={home}>
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-6 pt-8 text-center">
        {icon}
        <h1 role="status" className="text-[28px] font-semibold leading-8 text-ink">{title}</h1>
        {body && <p className="text-base leading-6 text-muted">{body}</p>}
      </div>

      {item?.amountUsdc && item.counterparty && (
        <dl className="mt-6 flex flex-col gap-3 rounded-card bg-surface p-4">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted">Amount</dt>
            <dd className="text-base font-semibold text-ink">{item.amountUsdc} USDC</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted">To</dt>
            <dd className="font-mono text-sm text-ink" title={item.counterparty} aria-label={item.counterparty}>{shortAddress(item.counterparty)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-sm text-muted">Network fee</dt>
            <dd className="text-sm text-ink">Paid by Swissquote</dd>
          </div>
        </dl>
      )}

      {tx.status === "confirmed" && tx.explorerUrl && (
        <a
          href={tx.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-pill bg-surface px-6 text-base font-semibold text-ink"
        >
          View on the explorer
          <ExternalLink size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </PageShell>
  );
}

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  return <Guard route="/send/result">{() => <Result id={id} />}</Guard>;
}
