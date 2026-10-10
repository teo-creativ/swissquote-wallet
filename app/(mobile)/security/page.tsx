"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppWindow, Download, FileText, KeyRound, LogOut, Smartphone } from "lucide-react";
import { createExitKit, getAccount, getAlerts, logout, revokeDevice } from "@/lib/sqkeys";
import type { Account, Alert, Device } from "@/lib/sqkeys";
import { Banner, BottomSheet, Button, Input, PageShell, RowCard, StatusChip } from "@/components/ui";
import { AppTabBar } from "../_lib/AppTabBar";
import { Guard } from "../_lib/Guard";
import { when } from "../_lib/ActivityRow";
import { downloadBlob } from "../_lib/download";
import { isNotAuthenticated, messageOf } from "../_lib/errors";
import { shortAddress } from "../_lib/send";
import { getProtectionLevel } from "@/lib/passkey/webauthn";

const MIN_PASSPHRASE = 12; // CDC 6.4
const acceptedOn = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[22px] font-semibold leading-7 text-ink">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

const LEGAL = [
  { slug: "terms", label: "Terms of use" },
  { slug: "risk", label: "Risk warning" },
  { slug: "recovery", label: "Recovery terms" },
  { slug: "privacy", label: "Privacy policy" },
  { slug: "cookies", label: "Cookies" },
  { slug: "notice", label: "Legal notice" },
];

// C15. Texts: annex F.5. The limits are read-only: only the lawyer changes them.
function Security({ initial }: { initial: Account }) {
  const router = useRouter();
  const [account, setAccount] = useState(initial);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(getProtectionLevel() === "reduced"), []);

  const [revoking, setRevoking] = useState<Device | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const [kitOpen, setKitOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [kitBusy, setKitBusy] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [a, al] = await Promise.all([getAccount(), getAlerts()]);
      setAccount(a);
      setAlerts(al);
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(messageOf(e));
    }
  }, [router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function confirmRevoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    setError(null);
    try {
      await revokeDevice(revoking.id);
      setRevoking(null);
      await refresh();
    } catch (e) {
      setRevoking(null);
      setError(messageOf(e));
    } finally {
      setRevokeBusy(false);
    }
  }

  async function makeKit() {
    setKitBusy(true);
    setKitError(null);
    try {
      const blob = await createExitKit(passphrase);
      downloadBlob(blob, "sqkeys-exit-kit.json");
      setKitOpen(false);
      setPassphrase("");
      await refresh();
    } catch (e) {
      setKitError(messageOf(e));
    } finally {
      setKitBusy(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  const policy = account.policy;
  const lawyerOk = account.lawyer.status === "accepted";
  const passphraseShort = passphrase.length > 0 && passphrase.length < MIN_PASSPHRASE;

  return (
    <PageShell title="Security" tabBar={<AppTabBar active="security" />}>
      {error && <Banner variant="warning" className="mb-2">{error}</Banner>}

      <Section title="Devices">
        {account.devices.map((d) => (
          <RowCard
            key={d.id}
            leading={<Smartphone size={20} strokeWidth={1.75} />}
            title={d.label}
            subtitle={`Added ${when(d.createdAt)}`}
            trailing={d.current ? (reduced ? <StatusChip status="warning">Reduced protection</StatusChip> : <StatusChip status="verified">This phone</StatusChip>) : <Button variant="secondary" fullWidth={false} className="min-h-11 px-4 text-base" onClick={() => setRevoking(d)}>Remove</Button>}
          />
        ))}
      </Section>

      <Section title="Your lawyer">
        <RowCard
          leading={<KeyRound size={20} strokeWidth={1.75} />}
          title="Your lawyer"
          subtitle={lawyerOk ? "Accepted" : "Waiting for your lawyer…"}
          trailing={<StatusChip status={lawyerOk ? "verified" : "pending"} />}
        />
      </Section>

      {policy && (
        <Section title="Your limits (set by your lawyer)">
          <dl className="flex flex-col gap-3 rounded-card bg-surface p-4">
            {[
              ["Per transfer", `${policy.perTxCap} USDC`],
              ["Per day", `${policy.dailyCap} USDC`],
              ["Transfers per hour", String(policy.hourlyCount)],
              ["Transfers per day", String(policy.dailyCount)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="text-base font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Known recipients">
        {(policy?.approvedRecipients.length ?? 0) === 0 && <p className="text-base text-muted">No known recipients yet.</p>}
        {policy?.approvedRecipients.map((a) => (
          <p key={a} className="rounded-card bg-surface px-4 py-3 font-mono text-sm text-ink" title={a} aria-label={a}>{shortAddress(a)}</p>
        ))}
      </Section>

      <Section title="Exit kit">
        <p className="text-base leading-6 text-muted">
          The exit kit lets you recover your funds with your lawyer even if Swissquote disappears. Keep the file and its passphrase away from your phone. The kit alone cannot move anything.
        </p>
        {account.exitKitCreatedAt && <p className="text-sm text-muted">Last created {when(account.exitKitCreatedAt)}.</p>}
        <Button variant="secondary" icon={<Download size={24} strokeWidth={1.75} />} onClick={() => setKitOpen(true)}>Create exit kit</Button>
      </Section>

      <Section title="Alerts">
        {alerts.length === 0 && <p className="text-base text-muted">No alerts.</p>}
        {alerts.map((a) => (
          <RowCard key={a.id} title={a.message} subtitle={when(a.createdAt)} trailing={a.read ? undefined : <StatusChip status="warning">New</StatusChip>} />
        ))}
      </Section>

      <Section title="Apps">
        <RowCard leading={<AppWindow size={20} strokeWidth={1.75} />} title="Allow an app (demo)" subtitle="Let a demo app spend USDC from your wallet" href="/apps/allow" />
      </Section>

      <Section title="Legal">
        {LEGAL.map((l) => {
          const accepted = account.consents?.find((c) => c.document === l.slug);
          return <RowCard key={l.slug} leading={<FileText size={20} strokeWidth={1.75} />} title={l.label} subtitle={accepted ? `Accepted on ${acceptedOn(accepted.acceptedAt)}` : undefined} href={`/legal/${l.slug}`} />;
        })}
      </Section>

      <div className="mt-8">
        <Button variant="secondary" loading={signingOut} icon={<LogOut size={24} strokeWidth={1.75} />} onClick={signOut}>Sign out</Button>
      </div>

      <BottomSheet open={revoking !== null} onClose={() => setRevoking(null)} title="Remove this phone?">
        <p className="mb-4 text-base leading-6 text-muted">{revoking?.label} will no longer be able to unlock its part of your key.</p>
        <div className="flex flex-col gap-3">
          <Button loading={revokeBusy} onClick={confirmRevoke}>Remove</Button>
          <Button variant="secondary" disabled={revokeBusy} onClick={() => setRevoking(null)}>Cancel</Button>
        </div>
      </BottomSheet>

      <BottomSheet open={kitOpen} onClose={() => setKitOpen(false)} title="Create exit kit">
        <p className="mb-4 text-base leading-6 text-muted">Choose a passphrase. You will need it with the file. We cannot recover it.</p>
        <Input
          label="Passphrase"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSPHRASE} characters.`}
          error={passphraseShort ? `Use at least ${MIN_PASSPHRASE} characters.` : kitError ?? undefined}
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
        <div className="mt-4 flex flex-col gap-3">
          <Button loading={kitBusy} disabled={passphrase.length < MIN_PASSPHRASE} icon={<Download size={24} strokeWidth={1.75} />} onClick={makeKit}>Create exit kit</Button>
          <Button variant="secondary" disabled={kitBusy} onClick={() => setKitOpen(false)}>Cancel</Button>
        </div>
      </BottomSheet>
    </PageShell>
  );
}

export default function SecurityPage() {
  return <Guard route="/security">{(account) => <Security initial={account} />}</Guard>;
}
