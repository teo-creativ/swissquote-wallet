"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { getMe } from "@/lib/lawyerApi";

const acceptedOn = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });

/** What the lawyer confirmed when creating the account (role and data documents), with the time and version. */
export function ConsentRecord() {
  const [consent, setConsent] = useState<{ termsVersion: string; acceptedAt: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe().then(
      (me) => {
        if (!cancelled && me.consent) setConsent(me.consent);
      },
      () => {
        /* No record to show: the page stays as it is. */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (!consent) return null;
  return (
    <Card>
      <p className="text-base text-ink">
        You confirmed “Your role as lawyer” and “Data we process” (version {consent.termsVersion}) on {acceptedOn(consent.acceptedAt)}.
      </p>
    </Card>
  );
}
