"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, KeyRound } from "lucide-react";
import { createDevicePasskey, SqKeysError } from "@/lib/sqkeys";
import { sealAfterPrf } from "@/lib/live/ceremony";
import { isMockMode } from "@/lib/sqkeys.mode";
import { detectInAppBrowser, interpretCapabilities, mapWebAuthnError } from "@/lib/passkey/helpers";
import type { PasskeyErrorInfo } from "@/lib/passkey/helpers";
import {
  PasskeyError, createPasskey, deriveWrappingKey, fetchPublicConfig, getPasskey, isStale, prepareChallenge, probeBrowser, setProtectionLevel, storeFallbackKey,
} from "@/lib/passkey/webauthn";
import type { PreparedChallenge } from "@/lib/passkey/webauthn";
import { Banner, Button, KeyShowcase, PageShell, SimulatedPill, StatusChip } from "@/components/ui";
import { Guard } from "../_lib/Guard";
import { InAppBrowserGate } from "../_lib/InAppBrowserGate";
import { GENERIC_ERROR, isNotAuthenticated } from "../_lib/errors";

const PASSKEY_ERROR = "This phone cannot protect your key with a passkey. Try another phone or browser.";

type Phase = "ready" | "confirm" | "done";

// C4. Texts: annex F.2. Comes AFTER the lawyer invitation (team decision, see docs/CONTRACT_CHANGE.md).
//
// The WebAuthn ceremony is real in both modes (Face ID / fingerprint is truly used). Mock mode then calls the mock contract. Live mode
// generates P1 in this browser, wraps it with the passkey (lib/live), and createDevicePasskey registers its public address.
// Every create()/get() below is called synchronously from a tap handler, with options prepared on mount.
function Key() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("ready");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyError, setPasskeyError] = useState<PasskeyErrorInfo | null>(null);
  const [inApp, setInApp] = useState<string | null>(null);
  const [advice, setAdvice] = useState<string[]>([]);
  const [reduced, setReduced] = useState(false);
  const prepared = useRef<PreparedChallenge | null>(null);
  const credentialId = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const allowNoPrf = useRef(false);

  // Everything async happens here, before any tap.
  useEffect(() => {
    setInApp(detectInAppBrowser(navigator.userAgent));
    prepared.current = prepareChallenge();
    void fetchPublicConfig().then((c) => (allowNoPrf.current = c.allowNoPrf));
    void probeBrowser().then((p) =>
      setAdvice(interpretCapabilities({ secureContext: p.isSecureContext, hasPublicKeyCredential: p.hasPublicKeyCredential, platformAuthenticator: p.platformAuthenticator, prfReported: p.clientCapabilities && "extension:prf" in p.clientCapabilities ? p.clientCapabilities["extension:prf"] : null }).advice),
    );
  }, []);

  function freshChallenge(): PreparedChallenge {
    if (!prepared.current || isStale(prepared.current)) prepared.current = prepareChallenge();
    return prepared.current;
  }

  async function finish(level: "prf" | "reduced" | null) {
    if (level) setProtectionLevel(level);
    setReduced(level === "reduced");
    try {
      await createDevicePasskey("This phone");
      setPhase("done");
      router.push("/creating");
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      setError(e instanceof SqKeysError ? PASSKEY_ERROR : GENERIC_ERROR);
      setLoading(false);
    }
  }

  async function afterPrf(output: Uint8Array<ArrayBuffer> | null) {
    if (!isMockMode) {
      // Live: P1 is generated in this browser and wrapped with the passkey. Only its public address leaves the phone.
      if (!credentialId.current) throw new PasskeyError(mapWebAuthnError({ name: "PASSKEY_PRF_MISSING" }));
      const sealed = await sealAfterPrf({ slot: "current", credentialId: credentialId.current, prfOutput: output, allowNoPrf: allowNoPrf.current });
      return finish(sealed.level);
    }
    if (output) {
      await deriveWrappingKey(output); // proves the HKDF + AES-GCM step works on this phone; the key itself is not kept here
      return finish("prf");
    }
    if (allowNoPrf.current) {
      await storeFallbackKey();
      return finish("reduced");
    }
    throw new PasskeyError(mapWebAuthnError({ name: "PASSKEY_PRF_MISSING" }));
  }

  function showFailure(e: unknown) {
    setPasskeyError(e instanceof PasskeyError ? e.info : mapWebAuthnError(e));
    setLoading(false);
  }

  // Tap 1. No await before createPasskey().
  function create() {
    setError(null);
    setPasskeyError(null);
    const challenge = freshChallenge();
    setLoading(true);
    createPasskey(challenge, "SQ Keys client").then(async (r) => {
      credentialId.current = new Uint8Array(r.credentialId) as Uint8Array<ArrayBuffer>;
      if (r.plan === "ready") return afterPrf(r.prfOutput as Uint8Array<ArrayBuffer>);
      if (r.plan === "needs_second_tap") {
        setPhase("confirm");
        setLoading(false);
        return;
      }
      return afterPrf(null);
    }, showFailure).catch(showFailure);
  }

  // Tap 2, also used to sign in with a passkey that already exists. Started from its own tap, never chained.
  function confirmOnce() {
    setError(null);
    setPasskeyError(null);
    setLoading(true);
    getPasskey(credentialId.current, freshChallenge().challenge, true)
      .then((r) => {
        credentialId.current = new Uint8Array(r.credentialId) as Uint8Array<ArrayBuffer>; // the passkey the user picked (existing or new)
        return afterPrf(r.prfOutput as Uint8Array<ArrayBuffer> | null);
      }, showFailure)
      .catch(showFailure);
  }

  if (inApp) return <InAppBrowserGate browser={inApp} />;

  const useExisting = passkeyError?.action === "sign_in_existing";
  const confirming = phase === "confirm" || useExisting;
  const label = confirming ? (useExisting ? "Use my existing passkey" : "Confirm once more") : "Create my key";

  return (
    <PageShell
      footer={
        <Button loading={loading} icon={confirming ? <Fingerprint size={24} strokeWidth={1.75} /> : <KeyRound size={24} strokeWidth={1.75} />} onClick={confirming ? confirmOnce : create}>
          {passkeyError && !useExisting ? "Try again" : label}
        </Button>
      }
    >
      <KeyShowcase variant="phone" className="-mt-2 h-[400px] overflow-hidden" />
      <h1 className="mt-6 text-[28px] font-semibold leading-8 text-ink">{phase === "confirm" ? "Confirm once more to protect your key" : "Create your key on this phone"}</h1>
      <p className="mt-3 text-base leading-6 text-muted">
        {phase === "confirm"
          ? "Your phone made the passkey. Face ID, fingerprint or your device code is needed once more to lock your part of the key with it."
          : "Your phone keeps one third of your key. Face ID, fingerprint or your device code unlocks it. It never leaves this phone."}
      </p>
      {isMockMode && (
        <div className="mt-3">
          <SimulatedPill>Simulated wallet. The passkey on this phone is real.</SimulatedPill>
        </div>
      )}
      {reduced && (
        <div className="mt-3">
          <StatusChip status="warning">Reduced protection</StatusChip>
        </div>
      )}
      {passkeyError && (
        <Banner variant="warning" className="mt-4">
          <span className="block font-medium">{passkeyError.message}</span>
          <span className="mt-1 block">{passkeyError.help}</span>
        </Banner>
      )}
      {advice.length > 0 && !passkeyError && (
        <Banner variant="warning" className="mt-4">
          {advice.join(" ")}
        </Banner>
      )}
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}
    </PageShell>
  );
}

export default function KeyPage() {
  return <Guard route="/key">{() => <Key />}</Guard>;
}
