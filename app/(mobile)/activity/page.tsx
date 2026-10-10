"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { getActivity } from "@/lib/sqkeys";
import type { ActivityItem } from "@/lib/sqkeys";
import { Banner, Button, PageShell, Spinner } from "@/components/ui";
import { ActivityRow } from "../_lib/ActivityRow";
import { AppTabBar } from "../_lib/AppTabBar";
import { Guard } from "../_lib/Guard";
import { downloadBlob } from "../_lib/download";
import { isNotAuthenticated, messageOf } from "../_lib/errors";

// C14. Transfers and security events (the client's own journal).
function Activity() {
  const router = useRouter();
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await getActivity());
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportJournal() {
    const journal = { exportedAt: new Date().toISOString(), network: "Base Sepolia (testnet)", items: items ?? [] };
    downloadBlob(new Blob([JSON.stringify(journal, null, 2)], { type: "application/json" }), "sqkeys-journal.json");
  }

  return (
    <PageShell title="Activity" tabBar={<AppTabBar active="activity" />}>
      {error && (
        <Banner variant="warning" action={<Button variant="secondary" className="min-h-11 text-base" onClick={load}>Try again</Button>}>
          {error}
        </Banner>
      )}
      {items === null && !error && <div className="flex justify-center py-10"><Spinner size={28} label="Loading" /></div>}
      {items?.length === 0 && <p className="text-base text-muted">No activity yet.</p>}
      {items && items.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((item) => <li key={item.id}><ActivityRow item={item} /></li>)}
          </ul>
          <Button variant="secondary" className="mt-6" icon={<Download size={24} strokeWidth={1.75} />} onClick={exportJournal}>
            Export journal
          </Button>
        </>
      )}
    </PageShell>
  );
}

export default function ActivityPage() {
  return <Guard route="/activity">{() => <Activity />}</Guard>;
}
