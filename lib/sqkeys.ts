// Front-facing API (CDC annex D.1). The front imports ONLY this file.
// NEXT_PUBLIC_SQKEYS_MODE=mock (default): every function delegates to lib/sqkeys.mock.ts (no backend).
// NEXT_PUBLIC_SQKEYS_MODE=live: bodies throw NOT_IMPLEMENTED until Aaron swaps in the real calls, without touching signatures.
import type { Account, ActivityItem, Alert, Device, RecoveryView, TransferCheck, TxView, WalletStep, AccountStatus } from "./sqkeys.types";
import { SqKeysError } from "./sqkeys.types";
import { isMockMode } from "./sqkeys.mode";
import * as mock from "./sqkeys.mock";
export * from "./sqkeys.types";
export { toBase, fromBase } from "./amounts";

const ni = (): never => { throw new SqKeysError("NOT_IMPLEMENTED", "Not implemented yet."); };

// Onboarding
export async function loginSwissquote(clientId: string, password: string): Promise<{ displayName: string; kycStatus: string; accountStatus: AccountStatus }> { return isMockMode ? mock.loginSwissquote(clientId, password) : ni(); }
export async function logout(): Promise<void> { return isMockMode ? mock.logout() : ni(); }
export async function runKyc(onProgress: (step: "document" | "selfie" | "banking_question") => void): Promise<void> { return isMockMode ? mock.runKyc(onProgress) : ni(); }
export async function registerAccount(consents: { document: "terms" | "risk" | "recovery" | "privacy"; version: string }[]): Promise<void> { return isMockMode ? mock.registerAccount(consents) : ni(); }
export async function createDevicePasskey(label: string): Promise<Device> { return isMockMode ? mock.createDevicePasskey(label) : ni(); }
export async function inviteLawyer(clientDisplayName: string): Promise<{ inviteUrl: string; expiresAt: string }> { return isMockMode ? mock.inviteLawyer(clientDisplayName) : ni(); }
export async function getLawyerStatus(): Promise<{ status: "none" | "invited" | "accepted"; displayName?: string; expiresAt?: string }> { return isMockMode ? mock.getLawyerStatus() : ni(); }
export async function createWallet(onProgress: (s: WalletStep) => void): Promise<{ address: string }> { return isMockMode ? mock.createWallet(onProgress) : ni(); }

// Wallet
export async function getAccount(): Promise<Account> { return isMockMode ? mock.getAccount() : ni(); }
export async function getBalance(): Promise<{ usdc: string; eth: string }> { return isMockMode ? mock.getBalance() : ni(); }
export async function checkTransfer(i: { to: string; amountUsdc: string }): Promise<TransferCheck> { return isMockMode ? mock.checkTransfer(i) : ni(); }
export async function sendUsdc(i: { to: string; amountUsdc: string }, onUpdate: (t: TxView) => void): Promise<TxView> { return isMockMode ? mock.sendUsdc(i, onUpdate) : ni(); }
export async function getTx(requestId: string): Promise<TxView> { return isMockMode ? mock.getTx(requestId) : ni(); }
export async function cancelTx(requestId: string): Promise<void> { return isMockMode ? mock.cancelTx(requestId) : ni(); }
export async function getActivity(): Promise<ActivityItem[]> { return isMockMode ? mock.getActivity() : ni(); }
export async function getAlerts(): Promise<Alert[]> { return isMockMode ? mock.getAlerts() : ni(); }

// Swissquote and applications
export async function getSwissquoteAccount(): Promise<{ cashChf: string }> { return isMockMode ? mock.getSwissquoteAccount() : ni(); }
export async function transferFromSwissquote(amountUsdc: string): Promise<{ txHash: string; explorerUrl: string }> { return isMockMode ? mock.transferFromSwissquote(amountUsdc) : ni(); }
export async function simulateApp(i: { spender: string; amountUsdc: string | "unlimited" }): Promise<{ appName: string | null; known: boolean; unlimited: boolean; plainText: string }> { return isMockMode ? mock.simulateApp(i) : ni(); }
export async function approveApp(i: { spender: string; amountUsdc: string | "unlimited" }, onUpdate: (t: TxView) => void): Promise<TxView> { return isMockMode ? mock.approveApp(i, onUpdate) : ni(); }

// Security
export async function createExitKit(passphrase: string): Promise<Blob> { return isMockMode ? mock.createExitKit(passphrase) : ni(); }
export async function revokeDevice(deviceId: string): Promise<void> { return isMockMode ? mock.revokeDevice(deviceId) : ni(); }

// Recovery (new phone)
export async function startRecovery(): Promise<{ recoveryId: string }> { return isMockMode ? mock.startRecovery() : ni(); }
export async function verifyIdentity(recoveryId: string, i: { bankingAnswer: string }): Promise<{ verified: boolean }> { return isMockMode ? mock.verifyIdentity(recoveryId, i) : ni(); }
export async function createRecoveryWallet(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> { return isMockMode ? mock.createRecoveryWallet(recoveryId, onProgress) : ni(); }
export async function getRecovery(recoveryId: string): Promise<RecoveryView> { return isMockMode ? mock.getRecovery(recoveryId) : ni(); }
export async function cancelRecovery(recoveryId: string): Promise<void> { return isMockMode ? mock.cancelRecovery(recoveryId) : ni(); }
export async function executeRecovery(recoveryId: string): Promise<{ txHash: string; explorerUrl: string }> { return isMockMode ? mock.executeRecovery(recoveryId) : ni(); }
