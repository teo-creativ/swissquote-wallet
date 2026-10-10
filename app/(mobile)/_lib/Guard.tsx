"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getAccount } from "@/lib/sqkeys";
import type { Account } from "@/lib/sqkeys";
import { Banner, Button, PageShell, Spinner } from "@/components/ui";
import { isNotAuthenticated, messageOf } from "./errors";

/** Routes a signed-in account may be on, by status. The first one is where we send it. */
export function routesFor(account: Account): string[] {
  switch (account.status) {
    case "created":
      // The contract does not say how far C2-C4 went: a registered phone key means the next step is the lawyer.
      return account.devices.length > 0 ? ["/lawyer"] : ["/verify", "/documents", "/key"];
    case "awaiting_lawyer":
      return ["/lawyer"];
    case "ready_for_keys":
    case "creating_wallet":
      return ["/creating"];
    default:
      return ["/home"]; // active, recovering
  }
}

export const entryRoute = (account: Account): string => routesFor(account)[0];

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
        const allowed = routesFor(a);
        if (allowed.includes(route)) setAccount(a);
        else router.replace(allowed[0]);
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
