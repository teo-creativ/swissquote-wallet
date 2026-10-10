"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Wallet } from "lucide-react";
import Link from "next/link";
import { getAccount, loginSwissquote } from "@/lib/sqkeys";
import { isMockMode } from "@/lib/sqkeys.mode";
import { Banner, Button, Input, Logo, PageShell, SimulatedPill } from "@/components/ui";
import { entryRoute } from "../_lib/Guard";
import { messageOf } from "../_lib/errors";
import { SESSION_KEYS, clearSession, readSession, writeSession } from "../_lib/session";

// C1. Texts: annex F.1 and F.2.
export default function LoginPage() {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in (page reload, back button): carry on where the account is.
  useEffect(() => {
    let alive = true;
    getAccount().then(
      (a) => alive && router.replace(entryRoute(a)),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await loginSwissquote(clientId.trim(), password);
      writeSession(SESSION_KEYS.displayName, session.displayName);
      const account = await getAccount();
      const next = readSession<string | null>(SESSION_KEYS.afterLogin, null);
      clearSession(SESSION_KEYS.afterLogin);
      router.replace(next ?? entryRoute(account));
    } catch (e) {
      setError(messageOf(e));
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <div className="pt-6">
        <Logo scale={1.5} withProductName />
      </div>
      <form onSubmit={submit} className="mt-20 flex flex-col gap-4">
        <h1 className="text-[28px] font-semibold leading-8 text-ink">Sign in with your Swissquote account</h1>
        <div>
          <SimulatedPill>Simulated Swissquote login</SimulatedPill>
        </div>
        {isMockMode && <Banner variant="demo">Demo account: client.lea / demo1234</Banner>}
        <Input label="Client ID" autoComplete="username" autoCapitalize="none" spellCheck={false} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Banner variant="warning">{error}</Banner>}
        <Button type="submit" loading={loading} disabled={!clientId.trim() || !password} trailingIcon={<ChevronRight size={24} strokeWidth={1.75} />}>
          Sign in
        </Button>
        <Link href="/recovery" className="mx-auto flex min-h-11 items-center gap-2 px-3 text-sm font-medium text-muted">
          <Wallet size={20} strokeWidth={1.75} aria-hidden="true" />
          I&apos;ve lost access to my wallet
        </Link>
      </form>
    </PageShell>
  );
}
