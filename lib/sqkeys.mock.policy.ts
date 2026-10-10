// Mock policy engine: same rules as CDC 8.2 (R0-R9), pure and deterministic.
// All amounts are integer base units (1 USDC = 1_000_000). `now` is passed in, never read from the clock.
import type { Reason } from "./sqkeys.types";

export type PolicyKind = "usdc_transfer" | "usdc_approve" | "ownership_proof";

export interface PolicyConfig {
  perTxCapBase: bigint;
  dailyCapBase: bigint;
  hourlyCount: number;
  dailyCount: number;
  newRecipientRequiresLawyer: boolean;
  maxPendingApprovals: number;
}

export const DEFAULT_POLICY: PolicyConfig = {
  perTxCapBase: 5_000_000n,
  dailyCapBase: 10_000_000n,
  hourlyCount: 3,
  dailyCount: 6,
  newRecipientRequiresLawyer: true,
  maxPendingApprovals: 5,
};

/** Approvals above this are "unlimited" (CDC R4: >= 2^255). */
export const UNLIMITED_BASE = 2n ** 255n;

export interface PolicyInput {
  kind: PolicyKind;
  /** Recipient (transfer) or spender (approve). */
  to: string;
  amountBase: bigint;
  /** For usdc_approve: is the spender on the approved app list? */
  knownApp?: boolean;
}

export interface AutoDecision {
  /** Epoch milliseconds when the AUTO decision (reservation) was created. */
  at: number;
  amountBase: bigint;
}

export interface PolicyState {
  /** Lower-cased addresses with status approved. */
  approvedRecipients: readonly string[];
  /** AUTO decisions of type transfer / approve, reserved from creation. */
  autoDecisions: readonly AutoDecision[];
  /** Requests currently waiting for the lawyer. */
  pendingCount: number;
}

export interface PolicyDecision {
  outcome: "AUTO" | "LAWYER" | "REFUSED";
  reasons: Reason[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Mock sanctions list: any address ending in 0000. */
export const isSanctioned = (address: string): boolean => address.toLowerCase().endsWith("0000");

export function evaluatePolicy(input: PolicyInput, state: PolicyState, policy: PolicyConfig, now: number): PolicyDecision {
  // R0 / R0b: hard refusals.
  if (isSanctioned(input.to)) return { outcome: "REFUSED", reasons: ["SANCTIONED_ADDRESS"] };
  if (state.pendingCount >= policy.maxPendingApprovals) return { outcome: "REFUSED", reasons: ["TOO_MANY_PENDING"] };
  // R2: amount must be positive (the message-only ownership proof has no amount).
  if (input.kind !== "ownership_proof" && input.amountBase <= 0n) return { outcome: "REFUSED", reasons: ["INVALID_AMOUNT"] };
  // R3: ownership proof is automatic (the Reason type has no dedicated code, WITHIN_POLICY stands in).
  if (input.kind === "ownership_proof") return { outcome: "AUTO", reasons: ["WITHIN_POLICY"] };

  // R4 to R8b: all evaluated, so every reason is listed.
  const reasons: Reason[] = [];
  const unlimited = input.amountBase >= UNLIMITED_BASE;
  if (input.kind === "usdc_approve") {
    if (unlimited) reasons.push("UNLIMITED_APPROVAL");
    if (!input.knownApp) reasons.push("UNKNOWN_APP");
  }
  if (input.kind === "usdc_transfer" && policy.newRecipientRequiresLawyer && !state.approvedRecipients.includes(input.to.toLowerCase())) {
    reasons.push("NEW_RECIPIENT");
  }
  // An unlimited approval is already explained by UNLIMITED_APPROVAL: amount rules would only add noise.
  if (!unlimited) {
    if (input.amountBase > policy.perTxCapBase) reasons.push("AMOUNT_ABOVE_THRESHOLD");
    const last24h = state.autoDecisions.filter((d) => d.at > now - DAY_MS);
    const last1h = last24h.filter((d) => d.at > now - HOUR_MS);
    const sum24h = last24h.reduce((sum, d) => sum + d.amountBase, 0n);
    if (sum24h + input.amountBase > policy.dailyCapBase) reasons.push("DAILY_CAP");
    if (last1h.length + 1 > policy.hourlyCount) reasons.push("VELOCITY");
    if (last24h.length + 1 > policy.dailyCount) reasons.push("DAILY_COUNT");
  }

  // R9
  if (reasons.length === 0) return { outcome: "AUTO", reasons: ["WITHIN_POLICY"] };
  return { outcome: "LAWYER", reasons };
}
