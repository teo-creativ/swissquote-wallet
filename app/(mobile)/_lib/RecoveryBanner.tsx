"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAccount } from "@/lib/sqkeys";
import { Banner, Button } from "@/components/ui";

// Screens where the banner makes no sense: not signed in yet, onboarding, the recovery screens themselves.
const HIDDEN_EXACT = ["/", "/login", "/verify", "/documents", "/key", "/lawyer", "/creating"];
const HIDDEN_PREFIX = ["/recovery", "/legal", "/dev"];
const POLL_MS = 5000;

/** Annex F.5: on every logged-in screen while a recovery exists, whatever device you are on. */
export function RecoveryBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [recoveryId, setRecoveryId] = useState<string | null>(null);
  const hidden = HIDDEN_EXACT.includes(pathname) || HIDDEN_PREFIX.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) {
      setRecoveryId(null);
      return;
    }
    let alive = true;
    const check = () =>
      getAccount().then(
        (a) => alive && setRecoveryId(a.recovery?.id ?? null),
        () => alive && setRecoveryId(null), // signed out or a failed poll: no banner
      );
    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [hidden, pathname]);

  if (!recoveryId || hidden) return null;
  return (
    <div className="px-4 pt-4">
      <Banner
        variant="warning"
        action={<Button variant="dark" className="min-h-11 text-base" onClick={() => router.push(`/recovery/${recoveryId}`)}>Cancel recovery</Button>}
      >
        A recovery was requested for your wallet. If this wasn&apos;t you, cancel it now.
      </Banner>
    </div>
  );
}
