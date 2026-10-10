"use client";

import { useEffect, useState } from "react";
import { inspectInvitation } from "@/lib/lawyerApi";
import type { LawyerApiError } from "@/lib/lawyerApi";

export type InvitationState =
  | { status: "loading" }
  | { status: "valid"; clientName: string; expiresAt: string }
  /** The link is past its 7 days. */
  | { status: "expired"; clientName: string }
  /** The link is still in date but was already accepted. */
  | { status: "used"; clientName: string }
  | { status: "error"; message: string };

/** Looks the invitation up once. Invalid links are told apart by their expiry date: past = expired, future = already used. */
export function useInvitation(token: string): InvitationState {
  const [state, setState] = useState<InvitationState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    inspectInvitation(token).then(
      (r) => {
        if (cancelled) return;
        if (r.valid) setState({ status: "valid", clientName: r.clientDisplayName, expiresAt: r.expiresAt });
        else if (Date.parse(r.expiresAt) <= Date.now()) setState({ status: "expired", clientName: r.clientDisplayName });
        else setState({ status: "used", clientName: r.clientDisplayName });
      },
      (e: LawyerApiError) => {
        if (!cancelled) setState({ status: "error", message: e.message || "We could not check this invitation. Try again." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  return state;
}
