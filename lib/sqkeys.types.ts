// Contract between the front (Téo) and the logic (Aaron). CDC annex D.1. Do not change signatures without both agreeing.
export type AccountStatus = "created" | "awaiting_lawyer" | "ready_for_keys" | "creating_wallet" | "active" | "recovering";
export type WalletStep = "preparing" | "creating_keys" | "checking_keys" | "saving_key_on_device" | "linking_wallet" | "funding_gas" | "done";
export type TxStatus = "evaluating" | "pending_lawyer" | "approved" | "signing" | "broadcast" | "confirmed" | "refused" | "expired" | "cancelled" | "failed";
export type Reason = "NEW_RECIPIENT" | "AMOUNT_ABOVE_THRESHOLD" | "DAILY_CAP" | "VELOCITY" | "DAILY_COUNT" | "TOO_MANY_PENDING" | "UNKNOWN_APP" | "UNLIMITED_APPROVAL" | "SANCTIONED_ADDRESS" | "INVALID_AMOUNT" | "WITHIN_POLICY";

export interface Device { id: string; label: string; createdAt: string; current: boolean }
export interface PolicyView { perTxCap: string; dailyCap: string; hourlyCount: number; dailyCount: number; newRecipientRequiresLawyer: boolean; approvedRecipients: string[] }
export interface Account {
  status: AccountStatus; address: string | null;
  lawyer: { status: "none" | "invited" | "accepted"; displayName?: string };
  devices: Device[]; exitKitCreatedAt: string | null;
  recovery: { id: string; status: string } | null; policy?: PolicyView;
}
export interface TransferCheck { outcome: "instant" | "lawyer" | "refused"; reasons: Reason[] }
export interface TxView { requestId: string; status: TxStatus; outcome: "AUTO" | "LAWYER" | "REFUSED"; reasons: Reason[]; approvalExpiresAt?: string; txHash?: string; explorerUrl?: string }
export interface ActivityItem { id: string; kind: "transfer_out" | "transfer_in" | "approval" | "security"; title: string; amountUsdc?: string; counterparty?: string; at: string; status?: TxStatus; txHash?: string; explorerUrl?: string }
export interface Alert { id: string; kind: string; message: string; createdAt: string; read: boolean }
export interface RecoveryView { status: string; oldAddress: string; newAddress?: string; releaseAfter?: string; lawyerStatus: "pending" | "approved" | "refused"; identityVerified: boolean; cancelledBy?: string }

export class SqKeysError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "SqKeysError"; }
}
