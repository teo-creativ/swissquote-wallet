"use client";

import { useEffect, useRef, useState } from "react";
import { Banner, Button, PageShell } from "@/components/ui";
import { detectInAppBrowser, interpretCapabilities, rpIdProblem } from "@/lib/passkey/helpers";
import { PasskeyError, createPasskey, getPasskey, prepareChallenge, probeBrowser, sameBytes } from "@/lib/passkey/webauthn";
import type { BrowserProbe } from "@/lib/passkey/webauthn";

type Row = [label: string, value: string];

function Table({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <dl className="mt-2 divide-y divide-line rounded-card bg-surface text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 px-4 py-2">
            <dt className="w-40 shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 flex-1 break-words text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const yn = (v: boolean | null | undefined): string => (v === null || v === undefined ? "unknown" : v ? "true" : "false");

export function PasskeyDiagnostics() {
  const [probe, setProbe] = useState<BrowserProbe | null>(null);
  const [createRows, setCreateRows] = useState<Row[]>([]);
  const [authRows, setAuthRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const credId = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const lastPrf = useRef<Uint8Array | null>(null);
  const authCount = useRef(0);

  useEffect(() => {
    void probeBrowser().then(setProbe);
  }, []);

  const outcome = (e: unknown): Row => {
    const info = e instanceof PasskeyError ? e.info : null;
    return ["Result", info ? `error ${info.name}: ${info.message}` : "error UnknownError"];
  };

  // Both handlers call the browser synchronously from the tap (no await first).
  function create() {
    setBusy(true);
    createPasskey(prepareChallenge(), "SQ Keys test", { test: true })
      .then(
        (r) => {
          credId.current = new Uint8Array(r.credentialId) as Uint8Array<ArrayBuffer>;
          lastPrf.current = null;
          authCount.current = 0;
          setCreateRows([
            ["Result", "success"],
            ["prf.enabled", yn(r.prfEnabled)],
            ["PRF result at creation", yn(r.prfOutput !== null)],
            ["Plan", r.plan],
          ]);
        },
        (e: unknown) => setCreateRows([outcome(e)]),
      )
      .finally(() => setBusy(false));
  }

  function authenticate() {
    setBusy(true);
    getPasskey(credId.current, prepareChallenge().challenge, true)
      .then(
        (r) => {
          authCount.current += 1;
          const same = lastPrf.current && r.prfOutput ? sameBytes(lastPrf.current, r.prfOutput) : null;
          lastPrf.current = r.prfOutput;
          setAuthRows([
            ["Result", `success (authentication #${authCount.current})`],
            ["PRF output present", yn(r.prfOutput !== null)],
            ["PRF output is 32 bytes", yn(r.prfOutput ? r.prfOutput.length === 32 : false)],
            ["Same as previous authentication", authCount.current < 2 ? "n/a (tap again)" : yn(same)],
          ]);
        },
        (e: unknown) => setAuthRows([outcome(e)]),
      )
      .finally(() => setBusy(false));
  }

  const inApp = probe ? detectInAppBrowser(probe.userAgent) : null;
  const verdict = probe
    ? interpretCapabilities({
        secureContext: probe.isSecureContext,
        hasPublicKeyCredential: probe.hasPublicKeyCredential,
        platformAuthenticator: probe.platformAuthenticator,
        prfReported: probe.clientCapabilities && "extension:prf" in probe.clientCapabilities ? probe.clientCapabilities["extension:prf"] : null,
      })
    : null;
  const problem = probe ? rpIdProblem(probe.rpId, probe.isSecureContext) : null;

  return (
    <PageShell title="Passkey diagnostics" subtitle="For phone testing. Shows no secret.">
      {probe && (
        <>
          <Table
            title="This browser"
            rows={[
              ["isSecureContext", yn(probe.isSecureContext)],
              ["origin", probe.origin],
              ["rpId used", probe.rpId],
              ["rpId problem", problem ?? "none"],
              ["PublicKeyCredential", probe.hasPublicKeyCredential ? "available" : "missing"],
              ["Platform authenticator", yn(probe.platformAuthenticator)],
              ["In-app browser", inApp ?? "no"],
              ["User agent", probe.userAgent],
              ["Client capabilities", probe.clientCapabilities ? Object.entries(probe.clientCapabilities).map(([k, v]) => `${k}=${v}`).join(", ") : "not reported by this browser"],
            ]}
          />
          {verdict && verdict.advice.length > 0 && <Banner variant="warning" className="mt-4">{verdict.advice.join(" ")}</Banner>}
          {inApp && <Banner variant="warning" className="mt-4">In-app browser detected ({inApp}). Open this page in Safari or Chrome.</Banner>}
        </>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <Button loading={busy} onClick={create}>Create test passkey (with PRF)</Button>
        <Button variant="secondary" loading={busy} onClick={authenticate}>Authenticate (with PRF)</Button>
      </div>
      {createRows.length > 0 && <Table title="Creation" rows={createRows} />}
      {authRows.length > 0 && <Table title="Authentication" rows={authRows} />}
      <p className="mt-6 text-xs text-muted">The test passkey is separate from the product one. Delete it in your phone settings when done.</p>
    </PageShell>
  );
}
