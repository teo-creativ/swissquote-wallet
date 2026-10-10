"use client";

import { useCallback, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Banner, Button, Card, CopyField, EmptyState, Spinner, StatusChip, Table } from "@/components/ui";
import type { TableColumn } from "@/components/ui";
import { getJournal, verifyAudit } from "@/lib/lawyerApi";
import type { JournalEntry } from "@/lib/lawyerApi.types";
import { autoTotalsLine, formatDateTime, integrityLabel } from "@/lib/format";
import { JOURNAL_TYPE_LABEL } from "@/lib/labels";
import { UpdatedAgo } from "./UpdatedAgo";
import { usePolling } from "./usePolling";

const PAGE = 50;

const COLUMNS: TableColumn<JournalEntry>[] = [
  { key: "seq", header: "#", render: (e) => <span className="tabular-nums text-muted">{e.seq}</span>, hideOnMobile: true },
  { key: "at", header: "Time", render: (e) => <span className="whitespace-nowrap text-muted">{formatDateTime(e.at)}</span> },
  { key: "type", header: "Type", render: (e) => JOURNAL_TYPE_LABEL[e.type], hideOnMobile: true },
  {
    key: "summary",
    header: "Entry",
    render: (e) => (
      <>
        {e.clientName && <span className="block text-xs font-medium text-muted">{e.clientName}</span>}
        <span className="block min-w-48 leading-5">{e.summary}</span>
      </>
    ),
  },
  { key: "hash", header: "Hash", render: (e) => <code className="font-mono text-xs text-muted">{e.hash}</code>, hideOnMobile: true },
];

type Check = { ok: boolean; checkedEntries: number; firstFailure?: string };

/** L9: the lawyer's own journal, integrity result and totals of automatic decisions (no detail rows, CDC 7.1). */
export function JournalView() {
  const [limit, setLimit] = useState(PAGE);
  const [verifying, setVerifying] = useState(false);
  const [checked, setChecked] = useState<(Check & { at: number }) | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const load = useCallback(() => getJournal(limit), [limit]);
  const { data, error, updatedAt } = usePolling(load);

  async function verify() {
    setVerifying(true);
    setVerifyError(null);
    try {
      setChecked({ ...(await verifyAudit()), at: Date.now() });
    } catch (e) {
      setVerifyError(e instanceof Error && e.message ? e.message : "Verification failed to run. Try again.");
    } finally {
      setVerifying(false);
    }
  }

  const integrity: Check | null = checked ?? data?.integrity ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-9 text-ink">Journal</h1>
        <UpdatedAgo at={updatedAt} />
      </div>

      {error && !data && <Banner variant="warning">{error}</Banner>}
      {!data && !error && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading the journal" />
        </div>
      )}

      {data && integrity && (
        <>
          <Card>
            <div className="grid items-center gap-5 md:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-3">
                <div role="status" className="flex flex-wrap items-center gap-3">
                  <StatusChip status={integrity.ok ? "verified" : "failed"} size="md">
                    {integrityLabel(integrity)}
                  </StatusChip>
                  <span className="text-xs text-muted">
                    {integrity.checkedEntries} entries checked{checked ? ", just now" : ""}
                  </span>
                </div>
                <CopyField label="Journal fingerprint" value={data.fingerprint} />
              </div>
              <Button
                variant="secondary"
                fullWidth={false}
                loading={verifying}
                onClick={verify}
                icon={<ShieldCheck size={22} strokeWidth={1.75} aria-hidden="true" />}
                className="md:min-w-56"
              >
                Verify integrity
              </Button>
            </div>
            {verifyError && <Banner variant="warning" className="mt-4">{verifyError}</Banner>}
          </Card>

          <p className="px-1 text-sm text-muted">{autoTotalsLine(data.autoDecisions24h)}</p>

          <Card flush>
            <Table
              columns={COLUMNS}
              rows={data.entries}
              rowKey={(e) => String(e.seq)}
              caption="Journal entries, newest first"
              empty={<EmptyState title="No journal entries yet." />}
            />
          </Card>

          {data.entries.length >= limit && (
            <Button variant="secondary" fullWidth={false} className="self-center" onClick={() => setLimit((n) => n + PAGE)}>
              Show older entries
            </Button>
          )}
        </>
      )}
    </div>
  );
}
