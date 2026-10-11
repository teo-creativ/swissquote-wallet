"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cancelTx, getTx } from "@/lib/sqkeys";
import type { TxView } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { Banner, Button, PageShell, SimulatedPill, Spinner } from "@/components/ui";
import { Guard } from "../../../_lib/Guard";
import { isNotAuthenticated, messageOf } from "../../../_lib/errors";

const POLL_MS = 3000;

// C10. Texts: annex F.3. "Send a notification" of the mockup became "Cancel this transfer" (push is out of scope).
function Waiting({ id }: { id: string }) {
  const router = useRouter();
  const [tx, setTx] = useState<TxView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setTx(await getTx(id));
    } catch (e) {
      if (isNotAuthenticated(e)) router.replace("/login");
      else setError(messageOf(e));
    }
  }, [id, router]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The lawyer answered (or the request ended): the result screen takes over.
  useEffect(() => {
    if (tx && tx.status !== "pending_lawyer" && tx.status !== "evaluating") router.replace(`/send/result/${id}`);
  }, [tx, id, router]);

  async function cancel() {
    setError(null);
    setCancelling(true);
    try {
      await cancelTx(id);
      router.replace(`/send/result/${id}`);
    } catch (e) {
      setError(messageOf(e));
      setCancelling(false);
    }
  }

  const until = tx?.approvalExpiresAt
    ? new Date(tx.approvalExpiresAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <PageShell footer={<Button variant="secondary" loading={cancelling} onClick={cancel}>Cancel this transfer</Button>}>
      <div className="flex min-h-[55dvh] flex-col items-center justify-center gap-6 text-center">
        <Spinner size={72} label="Waiting" />
        <h1 className="text-[28px] font-semibold leading-8 text-ink">Waiting for your lawyer</h1>
        <p className="text-base leading-6 text-muted">
          Your lawyer received the request. Nothing is sent yet. {isMockMode ? "If there is no answer within 48 hours" : "If there is no answer in time"}, the transfer is cancelled and nothing is written on the blockchain.
        </p>
        {until && <p className="text-sm text-muted">The request stays open until {until}.</p>}
        {isMockMode && <SimulatedPill>Simulated lawyer (played by a team member)</SimulatedPill>}
      </div>
      {error && <Banner variant="warning">{error}</Banner>}
    </PageShell>
  );
}

export default function WaitingPage() {
  const { id } = useParams<{ id: string }>();
  return <Guard route="/send/waiting">{() => <Waiting id={id} />}</Guard>;
}
