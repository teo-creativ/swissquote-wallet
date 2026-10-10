import type { TransferCheck, TxStatus } from "@/lib/sqkeys";

/** What C8 hands to C9. Kept in sessionStorage, never in the URL. */
export interface SendDraft {
  to: string;
  amountUsdc: string;
  check: TransferCheck;
}

export const DRAFT_KEY = "sqkeys.ui.sendDraft";

export const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
/** Digits with at most 6 decimals (USDC). */
export const AMOUNT_RE = /^\d+(\.\d{1,6})?$/;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const isFinished = (s: TxStatus) => s === "confirmed" || s === "refused" || s === "expired" || s === "cancelled" || s === "failed";
