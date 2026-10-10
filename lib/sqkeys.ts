// Front-facing API (CDC annex D.1). The front imports ONLY this file.
// Step 1: bodies throw NOT_IMPLEMENTED. Prompt client/02 replaces them with a realistic mock (NEXT_PUBLIC_SQKEYS_MODE=mock).
// Aaron later swaps the bodies for real calls (live) without touching signatures.
import type { Account, ActivityItem, Alert, Device, RecoveryView, TransferCheck, TxView, WalletStep, AccountStatus } from "./sqkeys.types";
import { SqKeysError } from "./sqkeys.types";
export * from "./sqkeys.types";
export { toBase, fromBase } from "./amounts";

const ni = (): never => { throw new SqKeysError("NOT_IMPLEMENTED", "Not implemented yet."); };

// Onboarding
export async function loginSwissquote(_clientId: string, _password: string): Promise<{ displayName: string; kycStatus: string; accountStatus: AccountStatus }> { return ni(); }
export async function logout(): Promise<void> { return ni(); }
export async function runKyc(_onProgress: (step: "document" | "selfie" | "banking_question") => void): Promise<void> { return ni(); }
export async function registerAccount(_consents: { document: "terms" | "risk" | "recovery" | "privacy"; version: string }[]): Promise<void> { return ni(); }
export async function createDevicePasskey(_label: string): Promise<Device> { return ni(); }
export async function inviteLawyer(_clientDisplayName: string): Promise<{ inviteUrl: string; expiresAt: string }> { return ni(); }
export async function getLawyerStatus(): Promise<{ status: "none" | "invited" | "accepted"; displayName?: string; expiresAt?: string }> { return ni(); }
export async function createWallet(_onProgress: (s: WalletStep) => void): Promise<{ address: string }> { return ni(); }

// Wallet
export async function getAccount(): Promise<Account> { return ni(); }
export async function getBalance(): Promise<{ usdc: string; eth: string }> { return ni(); }
export async function checkTransfer(_i: { to: string; amountUsdc: string }): Promise<TransferCheck> { return ni(); }
export async function sendUsdc(_i: { to: string; amountUsdc: string }, _onUpdate: (t: TxView) => void): Promise<TxView> { return ni(); }
export async function getTx(_requestId: string): Promise<TxView> { return ni(); }
export async function cancelTx(_requestId: string): Promise<void> { return ni(); }
export async function getActivity(): Promise<ActivityItem[]> { return ni(); }
export async function getAlerts(): Promise<Alert[]> { return ni(); }

// Swissquote and applications
export async function getSwissquoteAccount(): Promise<{ cashChf: string }> { return ni(); }
export async function transferFromSwissquote(_amountUsdc: string): Promise<{ txHash: string; explorerUrl: string }> { return ni(); }
export async function simulateApp(_i: { spender: string; amountUsdc: string | "unlimited" }): Promise<{ appName: string | null; known: boolean; unlimited: boolean; plainText: string }> { return ni(); }
export async function approveApp(_i: { spender: string; amountUsdc: string | "unlimited" }, _onUpdate: (t: TxView) => void): Promise<TxView> { return ni(); }

// Security
export async function createExitKit(_passphrase: string): Promise<Blob> { return ni(); }
export async function revokeDevice(_deviceId: string): Promise<void> { return ni(); }

// Recovery (new phone)
export async function startRecovery(): Promise<{ recoveryId: string }> { return ni(); }
export async function verifyIdentity(_recoveryId: string, _i: { bankingAnswer: string }): Promise<{ verified: boolean }> { return ni(); }
export async function createRecoveryWallet(_recoveryId: string, _onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> { return ni(); }
export async function getRecovery(_recoveryId: string): Promise<RecoveryView> { return ni(); }
export async function cancelRecovery(_recoveryId: string): Promise<void> { return ni(); }
export async function executeRecovery(_recoveryId: string): Promise<{ txHash: string; explorerUrl: string }> { return ni(); }
