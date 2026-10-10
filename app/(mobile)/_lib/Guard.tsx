"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAccount } from "@/lib/sqkeys";
import { isAllowed, redirectFor } from "@/lib/onboarding";
import type { Account } from "@/lib/sqkeys";
import { Banner, Button, PageShell, Spinner } from "@/components/ui";
import { isNotAuthenticated, messageOf } from "./errors";

export { entryRoute, isAllowed, routesFor } from "@/lib/onboarding";

/** Checks the session and the account status once, on mount. Wrong step: redirect. Not signed in: /login. */
export function Guard({ route, children }: { route: string; children: (account: Account) => ReactNode }) {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    getAccount().then(
      (a) => {
        if (!alive) return;
        if (isAllowed(a, route)) setAccount(a);
        else router.replace(redirectFor(a, route));
      },
      (e: unknown) => {
        if (!alive) return;
        if (isNotAuthenticated(e)) router.replace("/login");
        else setError(messageOf(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [route, router, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (account) return <>{children(account)}</>;
  return (
    <PageShell>
      {error ? (
        <div className="mt-10 flex flex-col gap-4">
          <Banner variant="warning">{error}</Banner>
          <Button variant="secondary" onClick={retry}>Try again</Button>
        </div>
      ) : (
        <div className="mt-24 flex justify-center">
          <Spinner size={32} label="Loading" />
        </div>
      )}
    </PageShell>
  );
}
