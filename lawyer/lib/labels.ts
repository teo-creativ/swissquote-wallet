import type { JournalEntryType, ReasonCode, RequestKind, RequestStatus } from "./lawyerApi.types";

/**
 * Why a request reached the lawyer, in the lawyer's voice. Annex F.3 only fixes the client-facing wording,
 * so these are short neutral labels for the "Why it needs you" chips.
 */
export const REASON_LABEL: Record<ReasonCode, string> = {
  NEW_RECIPIENT: "New recipient",
  AMOUNT_ABOVE_THRESHOLD: "Amount above the limit",
  DAILY_CAP: "Daily limit reached",
  VELOCITY: "Too many transfers in the last hour",
  DAILY_COUNT: "Daily number of transfers reached",
  TOO_MANY_PENDING: "Too many requests waiting",
  UNKNOWN_APP: "App not on the known list",
  UNLIMITED_APPROVAL: "Lets an app spend any amount",
  SANCTIONED_ADDRESS: "Sanctioned address",
  INVALID_AMOUNT: "Invalid amount",
  WITHIN_POLICY: "Within policy",
};

export const KIND_LABEL: Record<RequestKind, string> = {
  transfer: "Transfer",
  recovery: "Recovery",
  exit: "Exit",
};

export const STATUS_FILTERS: { status: RequestStatus; label: string; empty: string }[] = [
  { status: "pending", label: "Pending", empty: "No pending requests." },
  { status: "approved", label: "Approved", empty: "No approved requests." },
  { status: "refused", label: "Refused", empty: "No refused requests." },
  { status: "expired", label: "Expired", empty: "No expired requests." },
];

export const JOURNAL_TYPE_LABEL: Record<JournalEntryType, string> = {
  LAWYER_DECIDED: "Decision",
  POLICY_CHANGED: "Policy change",
  RECIPIENT_ADDED: "Recipient added",
  RECIPIENT_REVOKED: "Recipient revoked",
  RECOVERY_REQUESTED: "Recovery requested",
  RECOVERY_DECIDED: "Recovery decision",
  EXIT_REQUESTED: "Exit requested",
  EXIT_DECIDED: "Exit decision",
  LOGIN: "Access",
};
