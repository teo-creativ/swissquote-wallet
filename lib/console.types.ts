// Types for the Swissquote console (C21). Times are epoch milliseconds so they cross the server/client boundary as plain numbers.
// The console reads recovery state from sq-mock in live mode (CDC A.3); here it comes from lib/console.mock.ts.

export type IdentityOutcome = "pass" | "fail";
export type IdentityState = "not_requested" | "pending" | "verified" | "failed";
export type LawyerState = "pending" | "approved" | "declined";
export type RecoveryStatus = "pending" | "in_progress" | "blocked" | "completed" | "cancelled";

/** What is stored for one recovery. Everything else (identity result, lawyer approval, delay) is derived from these timestamps. */
export type Recovery = {
  id: string;
  clientId: string;
  createdAt: number;
  /** Set when Swissquote sends the identity check. */
  identityRequestedAt: number | null;
  /** The console setting captured when the check was sent. */
  identityOutcome: IdentityOutcome | null;
  /** Safety delay for this recovery, in seconds (production 24 h, demo 2 min). */
  delaySeconds: number;
  cancelledAt: number | null;
  cosignedAt: number | null;
  /** Hash of the linked cryptographic proof (recovery request). */
  proofHash: string;
};

/** A recovery with its derived state at a given instant. Pure function of (Recovery, now): see lib/console.logic.ts. */
export type RecoveryView = Recovery & {
  identity: IdentityState;
  identityVerifiedAt: number | null;
  identityFailedAt: number | null;
  lawyer: LawyerState;
  lawyerApprovedAt: number | null;
  /** identity_verified_at + delay. Null until the identity is verified. */
  releaseAfter: number | null;
  delayElapsed: boolean;
  /** Milliseconds left before release_after, 0 once elapsed, null when the delay has not started. */
  msLeft: number | null;
  status: RecoveryStatus;
  canCosign: boolean;
  /** Why the co-sign button is disabled. Null when it is enabled or already done. */
  cosignBlockedReason: string | null;
};

export type ClientStatus = "active" | "recovery_requested" | "archived";

export type ConsoleClient = {
  id: string;
  /** Short number shown in the badge, e.g. "0042". */
  number: string;
  displayName: string;
  address: string;
  status: ClientStatus;
  proofVerified: boolean;
  /** The demo switch: result of the next identity check for this client (CDC 6.3). */
  nextIdentityOutcome: IdentityOutcome;
};

export type OwnershipProof = {
  id: string;
  clientId: string;
  address: string;
  message: string;
  /** Shortened for display, never a full signature. */
  signature: string;
  verified: boolean;
  at: number;
};

export type AlertSeverity = "info" | "warning" | "critical";

export type ComplianceAlert = {
  id: string;
  at: number;
  severity: AlertSeverity;
  kind: "sanctioned_transfer" | "recovery_requested" | "identity_failed" | "recovery_completed";
  clientId: string;
  message: string;
};

export type SimulatedCall = {
  id: string;
  at: number;
  clientId: string;
  /** Masked: the console never shows a full phone number. */
  phone: string;
  reason: string;
  result: "Answered" | "No answer";
};
