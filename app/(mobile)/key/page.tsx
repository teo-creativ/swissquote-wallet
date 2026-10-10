"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { createDevicePasskey, SqKeysError } from "@/lib/sqkeys";
import { Banner, Button, KeyShowcase, PageShell } from "@/components/ui";
import { Guard } from "../_lib/Guard";
import { GENERIC_ERROR, isNotAuthenticated } from "../_lib/errors";

const PASSKEY_ERROR = "This phone cannot protect your key with a passkey. Try another phone or browser.";

// C4. Texts: annex F.2.
function Key() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    setLoading(true);
    try {
      await createDevicePasskey("This phone");
      router.push("/lawyer");
    } catch (e) {
      if (isNotAuthenticated(e)) return router.replace("/login");
      // Any refusal from the passkey layer means this device cannot hold the key: no silent fallback (CDC 4.4).
      setError(e instanceof SqKeysError ? PASSKEY_ERROR : GENERIC_ERROR);
      setLoading(false);
    }
  }

  return (
    <PageShell
      footer={
        <Button loading={loading} icon={<KeyRound size={24} strokeWidth={1.75} />} onClick={create}>
          Create my key
        </Button>
      }
    >
      <KeyShowcase variant="phone" className="-mt-2 h-[400px] overflow-hidden" />
      <h1 className="mt-6 text-[28px] font-semibold leading-8 text-ink">Create your key on this phone</h1>
      <p className="mt-3 text-base leading-6 text-muted">
        Your phone keeps one third of your key. Face ID, fingerprint or your device code unlocks it. It never leaves this phone.
      </p>
      {error && <Banner variant="warning" className="mt-4">{error}</Banner>}
    </PageShell>
  );
}

export default function KeyPage() {
  return <Guard route="/key">{() => <Key />}</Guard>;
}
