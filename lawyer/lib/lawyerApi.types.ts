// Lawyer portal front contract (CDC annex D.2). The front imports ONLY lib/lawyerApi.ts and these types.
// Amounts are decimal USDC strings ("5.00"), like the client app. Dates are ISO 8601 strings.
import type { REASONS } from "@/src/shared/constants";

export type RequestStatus = "pending" | "approved" | "refused" | "expired";
export type ReasonCode = (typeof REASONS)[number];

export class LawyerApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "LawyerApiError";
  }
}

export interface PolicyEdit {
  perTxCap: string; dailyCap: string; hourlyCount: number; dailyCount: number;
  newRecipientRequiresLawyer: boolean; approvedRecipients: string[]; version?: number;
}

export type ClientStatus = "invited" | "active" | "recovering";

export interface ClientView {
  id: string;
  displayName: string;
  /** Wallet address, null until the wallet exists (status "invited"). */
  address: string | null;
  status: ClientStatus;
  pendingRequests: number;
  /** Current policy version, shown on the client card (L8 link). */
  policyVersion: number;
}

export type RequestKind = "transfer" | "recovery" | "exit";

export interface RequestSummary {
  id: string;
  clientId: string;
  clientName: string;
  kind: RequestKind;
  status: RequestStatus;
  /** Transfers only. */
  amount?: string;
  /** Transfers: recipient. Exits: destination address. */
  to?: string;
  createdAt: string;
  /** The request is cancelled and nothing is sent if the lawyer does not answer before this time. */
  expiresAt: string;
}

export interface RecipientHistoryItem {
  at: string;
  amount: string;
  /** What happened with an earlier request to this recipient. Automatic transfers are never listed (CDC 7.1). */
  result: "approved" | "refused";
}

export type TimelineStepState = "done" | "current" | "todo" | "failed";

export interface TimelineStep {
  /** Annex F.5 wording: "Identity verified", "Lawyer approval", "Waiting period", "Moving your funds", "Done". */
  label: string;
  state: TimelineStepState;
  at?: string;
}

export type IdentityCheck = "pending" | "verified" | "failed";

export interface RecoveryInfo {
  oldAddress: string;
  /** Recovery only; exits go to `RequestDetail.to`. */
  newAddress?: string;
  /** Swissquote's identity check. Recovery only: an exit request does not involve Swissquote. */
  identity?: IdentityCheck;
  timeline: TimelineStep[];
  /** End of the waiting period. Set once the lawyer approved. Drives the Countdown. */
  delayEndsAt?: string;
}

export interface RequestDetail extends RequestSummary {
  /** Why the policy sent this to the lawyer (transfers). Codes map to annex F.3 texts in the front. */
  reasons: ReasonCode[];
  /** Earlier decisions of this lawyer about the same recipient. */
  recipientHistory: RecipientHistoryItem[];
  /** The client's current limits (L6 right card). */
  limits: Omit<PolicyEdit, "approvedRecipients" | "version">;
  /** True when the recipient is already in the known list. */
  recipientKnown: boolean;
  /** SHA-256 hex of the canonical intent (CDC 5.4). Show it shortened. */
  intentHash: string;
  /** Recovery and exit requests. */
  recovery?: RecoveryInfo;
  decidedAt?: string;
}

export type JournalEntryType =
  | "LAWYER_DECIDED"
  | "POLICY_CHANGED"
  | "RECIPIENT_ADDED"
  | "RECIPIENT_REVOKED"
  | "RECOVERY_REQUESTED"
  | "RECOVERY_DECIDED"
  | "EXIT_REQUESTED"
  | "EXIT_DECIDED"
  | "LOGIN";

export interface JournalEntry {
  /** 1-based position in the chain. */
  seq: number;
  at: string;
  type: JournalEntryType;
  clientName?: string;
  /** One plain English line, no secrets. */
  summary: string;
  /** Short entry hash (first 16 hex characters). */
  hash: string;
}

export interface JournalView {
  /** Newest first. */
  entries: JournalEntry[];
  /** Fingerprint of the last entry (the head of the chain). */
  fingerprint: string;
  integrity: { ok: boolean; checkedEntries: number; firstFailure?: string };
  /** Totals only, never details (CDC 7.1): automatic decisions in the last 24 hours. */
  autoDecisions24h: { count: number; totalUsdc: string };
}
