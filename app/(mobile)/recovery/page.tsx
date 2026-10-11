"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { startRecovery } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { Banner, Button, PageShell } from "@/components/ui";
import { isNotAuthenticated, messageOf } from "../_lib/errors";
import { SESSION_KEYS, writeSession } from "../_lib/session";

// C17. Texts: annex F.5 and F.1. Reachable before signing in ("I've lost access to my wallet" on C1).
export default function RecoveryStartPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setLoading(true);
    try {
      const { recoveryId } = await startRecovery();
      router.push(`/recovery/${recoveryId}/verify`);
    } catch (e) {
      if (isNotAuthenticated(e)) {
        // The recovery starts from the new phone after signing in with the Swissquote account (CDC 6.2 step 1).
        writeSession(SESSION_KEYS.afterLogin, "/recovery");
        return router.push("/login");
      }
      setError(messageOf(e));
      setLoading(false);
    }
  }

  return (
    <PageShell
      title="I lost my phone"
      backHref="/login"
      footer={
        <div className="flex flex-col gap-3">
          <Button loading={loading} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />} onClick={start}>Start recovery</Button>
          <Button variant="secondary" disabled={loading} onClick={() => router.push("/login")}>Cancel</Button>
        </div>
      }
    >
      <p className="text-base leading-6 text-muted">
        {isMockMode
          ? "We will check your identity, create a new wallet on this phone and move your funds to it. Your lawyer must approve, and there is a waiting period during which you can cancel. Your wallet address will change."
          : "We will check your identity and create a new key on this phone. Your lawyer must approve, and there is a waiting period during which you can cancel. Then your old key is replaced by the new one on your wallet. Your wallet address and your funds stay the same."}
      </p>
      <Banner variant="demo" className="mt-6">{isMockMode ? "Demo mode: recovery delay is 2 minutes. In production it would be 24 hours." : "Demo mode: recovery delay is 15 seconds. In production it would be 24 hours."}</Banner>
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}
    </PageShell>
  );
}
