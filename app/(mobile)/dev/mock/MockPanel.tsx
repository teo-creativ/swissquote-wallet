"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Banner, Button, PageShell, RowCard, SimulatedPill, StatusChip } from "@/components/ui";
import {
  acceptMockLawyerInvite,
  getMockSnapshot,
  resetMockState,
  resolveMockRecoveryLawyer,
  resolveMockTx,
  seedActiveWallet,
  setMockPanel,
  skipDelay,
} from "@/lib/sqkeys.mock";
import type { MockSnapshot } from "@/lib/sqkeys.mock";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[22px] font-semibold leading-7 text-ink">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-card bg-surface px-4 py-3">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-6 shrink-0 accent-brand" />
      <span className="flex-1">
        <span className="block text-base font-medium text-ink">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <span className="text-sm font-semibold text-ink">{checked ? "On" : "Off"}</span>
    </label>
  );
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function MockPanel() {
  const [snap, setSnap] = useState<MockSnapshot | null>(null);

  // Polling also advances the lazy timers (auto lawyer, recovery delay) while this page is open.
  useEffect(() => {
    const refresh = () => setSnap(getMockSnapshot());
    refresh();
    const id = setInterval(refresh, 500);
    return () => clearInterval(id);
  }, []);

  const act = (fn: () => void) => () => {
    fn();
    setSnap(getMockSnapshot());
  };

  if (!snap) return <PageShell title="Mock panel">{null}</PageShell>;
  const secondsLeft = snap.recovery?.releaseAfter ? Math.max(0, Math.ceil((Date.parse(snap.recovery.releaseAfter) - Date.now()) / 1000)) : null;

  return (
    <PageShell title="Mock panel" subtitle="Controls the simulated backend (lib/sqkeys.mock.ts). Dev only.">
      <Banner variant="demo" className="mb-6">
        State lives in this tab&apos;s sessionStorage: open the app and this panel in the same tab (use the browser back button), not in two tabs.
      </Banner>

      <Section title="Switches">
        <Switch label="Auto lawyer" hint="The simulated lawyer accepts and approves after 8 s." checked={snap.panel.autoLawyer} onChange={(v) => act(() => setMockPanel({ autoLawyer: v }))()} />
        <Switch label="Identity check passes" hint="Result of the simulated identity check in recovery." checked={snap.panel.identityPass} onChange={(v) => act(() => setMockPanel({ identityPass: v }))()} />
        <Switch label="Phone supports passkeys" hint="Off: the phone key step fails with the no-PRF error." checked={snap.panel.prfSupported !== false} onChange={(v) => act(() => setMockPanel({ prfSupported: v }))()} />
      </Section>

      <Section title="State">
        <RowCard title="Signed in" trailing={<StatusChip status={snap.loggedIn ? "verified" : "neutral"}>{snap.loggedIn ? "Yes" : "No"}</StatusChip>} />
        <RowCard title="Account status" subtitle={snap.address ? short(snap.address) : "No wallet yet"} trailing={<span className="text-sm font-semibold">{snap.accountStatus}</span>} />
        <RowCard title="Balance" trailing={<span className="text-base font-semibold">{snap.usdc} USDC</span>} />
        <RowCard title="Lawyer invitation" trailing={<SimulatedPill>{snap.invite}</SimulatedPill>} />
        {snap.invite === "invited" && <Button variant="secondary" onClick={act(acceptMockLawyerInvite)}>Lawyer accepts the invitation</Button>}
      </Section>

      <Section title="Lawyer requests">
        {snap.pendingTxs.length === 0 && <p className="text-base text-muted">No pending requests.</p>}
        {snap.pendingTxs.map((tx) => (
          <div key={tx.id} className="rounded-card bg-surface p-4">
            <p className="text-base font-medium text-ink">
              {tx.kind === "transfer" ? "Send" : "Approve"} {tx.amountUsdc} USDC to {short(tx.to)}
            </p>
            <p className="mb-3 text-sm text-muted">{tx.reasons.join(", ")}</p>
            <div className="flex flex-col gap-2">
              <Button className="min-h-11 text-base" onClick={act(() => resolveMockTx(tx.id, "approved"))}>Approve</Button>
              <Button className="min-h-11 text-base" variant="secondary" onClick={act(() => resolveMockTx(tx.id, "refused"))}>Decline</Button>
              <Button className="min-h-11 text-base" variant="secondary" onClick={act(() => resolveMockTx(tx.id, "expired"))}>Expire</Button>
            </div>
          </div>
        ))}
      </Section>

      <Section title="Recovery">
        {!snap.recovery && <p className="text-base text-muted">No recovery running.</p>}
        {snap.recovery && (
          <div className="rounded-card bg-surface p-4">
            <p className="text-base font-medium text-ink">Status: {snap.recovery.status}</p>
            <p className="text-sm text-muted">
              Identity {snap.recovery.identityVerified ? "verified" : "not verified"} · lawyer {snap.recovery.lawyerStatus}
              {secondsLeft !== null && ` · ${secondsLeft} s left`}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button className="min-h-11 text-base" onClick={act(() => resolveMockRecoveryLawyer((snap.recovery as { id: string }).id, "approved"))}>Lawyer approves</Button>
              <Button className="min-h-11 text-base" variant="secondary" onClick={act(() => resolveMockRecoveryLawyer((snap.recovery as { id: string }).id, "refused"))}>Lawyer declines</Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Actions">
        <Button variant="dark" onClick={act(skipDelay)}>Skip delay (+120 s)</Button>
        <Button variant="secondary" onClick={act(seedActiveWallet)}>Jump to an active wallet (25 USDC)</Button>
        <Button variant="secondary" onClick={act(resetMockState)}>Reset state</Button>
      </Section>
    </PageShell>
  );
}
