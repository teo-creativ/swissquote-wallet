"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Fingerprint, Plus, UserMinus } from "lucide-react";
import { Banner, Button, Card, Dialog, EmptyState, Input, Spinner, StatusChip, Switch, useToast } from "@/components/ui";
import { getClients, getJournal, getPolicy, updatePolicy } from "@/lib/lawyerApi";
import type { ClientView, JournalEntry, PolicyEdit } from "@/lib/lawyerApi.types";
import { formatDateTime, shortAddress } from "@/lib/format";
import { diffPolicy, isAddress, policyFieldErrors } from "@/lib/policy";
import { Breadcrumb } from "./detailParts";

type Loaded = { client: ClientView; policy: PolicyEdit & { version: number }; history: JournalEntry[] };

type Form = {
  perTxCap: string;
  dailyCap: string;
  hourlyCount: string;
  dailyCount: string;
  newRecipientRequiresLawyer: boolean;
  approvedRecipients: string[];
};

const toForm = (p: PolicyEdit): Form => ({
  perTxCap: p.perTxCap,
  dailyCap: p.dailyCap,
  hourlyCount: String(p.hourlyCount),
  dailyCount: String(p.dailyCount),
  newRecipientRequiresLawyer: p.newRecipientRequiresLawyer,
  approvedRecipients: [...p.approvedRecipients],
});

/** Counts must be whole numbers: anything else becomes NaN, which the validation rejects. */
const count = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN);

const toPolicy = (f: Form, version: number): PolicyEdit => ({
  perTxCap: f.perTxCap.trim(),
  dailyCap: f.dailyCap.trim(),
  hourlyCount: count(f.hourlyCount),
  dailyCount: count(f.dailyCount),
  newRecipientRequiresLawyer: f.newRecipientRequiresLawyer,
  approvedRecipients: f.approvedRecipients,
  version,
});

/** L8: one client's limits, unknown-recipient switch, known recipients and version history. */
export function PolicyView({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [recipient, setRecipient] = useState("");
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [clients, policy, journal] = await Promise.all([getClients(), getPolicy(clientId), getJournal(200)]);
      const client = clients.find((c) => c.id === clientId);
      if (!client) throw new Error("This client does not exist.");
      const history = journal.entries.filter((e) => e.type === "POLICY_CHANGED" && e.clientName === client.displayName);
      setLoaded({ client, policy: { ...policy, version: policy.version ?? client.policyVersion }, history });
      setForm(toForm(policy));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error && e.message ? e.message : "Something went wrong.");
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded || !form) {
    return loadError ? (
      <div className="flex flex-col gap-4">
        <Banner variant="warning">{loadError}</Banner>
        <Link href="/clients" className="inline-flex min-h-11 items-center text-sm font-medium text-warn">
          Back to clients
        </Link>
      </div>
    ) : (
      <div className="flex justify-center py-16">
        <Spinner label="Loading the policy" />
      </div>
    );
  }

  const { client, policy, history } = loaded;
  const draft = toPolicy(form, policy.version);
  const errors = policyFieldErrors(draft);
  const valid = Object.keys(errors).length === 0;
  // Only compare when the draft is valid: NaN counts would make a meaningless diff.
  const diff = valid ? diffPolicy(policy, draft) : null;
  const dirty = valid ? !diff!.isEmpty : JSON.stringify(toForm(policy)) !== JSON.stringify(form);
  const nextVersion = policy.version + 1;
  const baselineRecipients = new Set(policy.approvedRecipients.map((a) => a.toLowerCase()));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  function addRecipient(event: FormEvent) {
    event.preventDefault();
    const address = recipient.trim();
    if (!isAddress(address)) return setRecipientError("Enter a full address: 0x followed by 40 characters.");
    if (form!.approvedRecipients.some((a) => a.toLowerCase() === address.toLowerCase())) {
      return setRecipientError("This recipient is already in the list.");
    }
    set("approvedRecipients", [...form!.approvedRecipients, address]);
    setRecipient("");
    setRecipientError(null);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updatePolicy(clientId, draft);
      setReview(false);
      toast(`Policy saved. Version ${nextVersion}.`);
      await load();
    } catch (e) {
      setSaveError(e instanceof Error && e.message ? e.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb current="Policy" parent={{ label: "Clients", href: "/clients" }} />
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-9 text-ink">{client.displayName}</h1>
          <span className="inline-flex h-6 items-center rounded-pill bg-info-bg px-2.5 text-[11px] font-medium leading-[14px] text-info">
            Version {policy.version}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">Changes apply to new requests only. Saving needs your passkey.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card title="Your limits for this client">
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Per transfer"
                inputMode="decimal"
                value={form.perTxCap}
                onChange={(e) => set("perTxCap", e.target.value)}
                error={errors.perTxCap}
                hint="0 sends every transfer to you."
                trailing={<span className="pr-3 text-sm text-muted">USDC</span>}
              />
              <Input
                label="Per day"
                inputMode="decimal"
                value={form.dailyCap}
                onChange={(e) => set("dailyCap", e.target.value)}
                error={errors.dailyCap}
                hint="Automatic transfers over 24 hours."
                trailing={<span className="pr-3 text-sm text-muted">USDC</span>}
              />
              <Input
                label="Transfers per hour"
                inputMode="numeric"
                value={form.hourlyCount}
                onChange={(e) => set("hourlyCount", e.target.value)}
                error={errors.hourlyCount}
              />
              <Input
                label="Transfers per day"
                inputMode="numeric"
                value={form.dailyCount}
                onChange={(e) => set("dailyCount", e.target.value)}
                error={errors.dailyCount}
              />
            </div>
            <Switch
              className="mt-5"
              checked={form.newRecipientRequiresLawyer}
              onChange={(v) => set("newRecipientRequiresLawyer", v)}
              hint="When on, the first transfer to a new address waits for you."
            >
              An unknown recipient needs my approval
            </Switch>
          </Card>

          <Card title="Known recipients">
            {form.approvedRecipients.length === 0 ? (
              <EmptyState title="No known recipients." className="py-6" />
            ) : (
              <ul className="divide-y divide-line">
                {form.approvedRecipients.map((a) => (
                  <li key={a.toLowerCase()} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate font-mono text-sm text-ink" title={a}>
                      {shortAddress(a)}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {!baselineRecipients.has(a.toLowerCase()) && <StatusChip status="pending">New</StatusChip>}
                      <button
                        type="button"
                        onClick={() => set("approvedRecipients", form.approvedRecipients.filter((x) => x !== a))}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-sm font-medium text-danger"
                      >
                        <UserMinus size={16} strokeWidth={1.75} aria-hidden="true" />
                        Revoke<span className="sr-only"> {shortAddress(a)}</span>
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {errors.approvedRecipients && <Banner variant="warning" className="mt-3">{errors.approvedRecipients}</Banner>}
            <form onSubmit={addRecipient} noValidate className="mt-4">
              <Input
                label="Add a recipient"
                placeholder="0x…"
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(e) => {
                  setRecipient(e.target.value);
                  setRecipientError(null);
                }}
                error={recipientError ?? undefined}
                trailing={
                  <button
                    type="submit"
                    aria-label="Add recipient"
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-dark text-white"
                  >
                    <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                }
              />
            </form>
          </Card>

          <div className="flex flex-col gap-3">
            <Button
              disabled={!valid || !dirty}
              onClick={() => {
                setSaveError(null);
                setReview(true);
              }}
              icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}
            >
              Review and save
            </Button>
            {dirty ? (
              <Button variant="secondary" onClick={() => setForm(toForm(policy))}>
                Discard changes
              </Button>
            ) : (
              <p className="px-1 text-center text-xs text-muted">No changes to save.</p>
            )}
            {!valid && <p className="px-1 text-center text-xs text-danger">Fix the highlighted fields to continue.</p>}
          </div>
        </div>

        <Card title="Version history">
          {history.length === 0 ? (
            <EmptyState title="No versions yet." className="py-6" />
          ) : (
            <ol className="flex flex-col divide-y divide-line">
              {history.map((e, i) => (
                <li key={e.seq} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted">{formatDateTime(e.at)}</span>
                    {i === 0 && <StatusChip status="verified">Current</StatusChip>}
                  </div>
                  <p className="text-sm leading-5 text-ink">{e.summary}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <Dialog
        open={review}
        onClose={() => !saving && setReview(false)}
        title="Review your changes"
        footer={
          <>
            <Button variant="secondary" disabled={saving} onClick={() => setReview(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save} icon={<Fingerprint size={22} strokeWidth={1.75} aria-hidden="true" />}>
              Save with passkey
            </Button>
          </>
        }
      >
        <p>
          Saving creates version {nextVersion} of {client.displayName}&apos;s policy. Confirm with your passkey.
        </p>
        {diff && (
          <ul aria-label="Changes" className="mt-4 flex flex-col divide-y divide-line rounded-card border border-line">
            {diff.changes.map((c) => (
              <li key={c.field} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-3">
                <span className="text-muted">{c.label}</span>
                <span className="font-medium">
                  <span className="text-muted line-through">{c.before}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only"> changes to </span>
                  {c.after}
                </span>
              </li>
            ))}
            {diff.addedRecipients.map((a) => (
              <li key={`add-${a}`} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="text-muted">Known recipient added</span>
                <span className="font-mono font-medium">{shortAddress(a)}</span>
              </li>
            ))}
            {diff.removedRecipients.map((a) => (
              <li key={`rm-${a}`} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="text-muted">Known recipient revoked</span>
                <span className="font-mono font-medium">{shortAddress(a)}</span>
              </li>
            ))}
          </ul>
        )}
        {saveError && <Banner variant="warning" className="mt-4">{saveError}</Banner>}
      </Dialog>
    </div>
  );
}
