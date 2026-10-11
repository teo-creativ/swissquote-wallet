// Front-facing API (CDC annex D.1). The front imports ONLY this file.
// NEXT_PUBLIC_SQKEYS_MODE=mock (default): every function delegates to lib/sqkeys.mock.ts (no backend).
// NEXT_PUBLIC_SQKEYS_MODE=live: real calls (lib/live: browser, app/api/live: server) to a Safe 2-of-3 smart account on Base Sepolia. Signatures unchanged.
import type { Account, ActivityItem, Alert, Device, RecoveryView, TransferCheck, TxView, WalletStep, AccountStatus } from "./sqkeys.types";
import { isMockMode } from "./sqkeys.mode";
import * as mock from "./sqkeys.mock";
import * as live from "./live";
export * from "./sqkeys.types";
export { toBase, fromBase } from "./amounts";


// Onboarding
export async function loginSwissquote(clientId: string, password: string): Promise<{ displayName: string; kycStatus: string; accountStatus: AccountStatus }> { return isMockMode ? mock.loginSwissquote(clientId, password) : live.loginSwissquote(clientId, password); }
export async function logout(): Promise<void> { return isMockMode ? mock.logout() : live.logout(); }
export async function runKyc(onProgress: (step: "document" | "selfie" | "banking_question") => void): Promise<void> { return isMockMode ? mock.runKyc(onProgress) : live.runKyc(onProgress); }
export async function registerAccount(consents: { document: "terms" | "risk" | "recovery" | "privacy"; version: string }[]): Promise<void> { return isMockMode ? mock.registerAccount(consents) : live.registerAccount(consents); }
export async function createDevicePasskey(label: string): Promise<Device> { return isMockMode ? mock.createDevicePasskey(label) : live.createDevicePasskey(label); }
export async function inviteLawyer(clientDisplayName: string): Promise<{ inviteUrl: string; expiresAt: string }> { return isMockMode ? mock.inviteLawyer(clientDisplayName) : live.inviteLawyer(clientDisplayName); }
export async function getLawyerStatus(): Promise<{ status: "none" | "invited" | "accepted"; displayName?: string; expiresAt?: string }> { return isMockMode ? mock.getLawyerStatus() : live.getLawyerStatus(); }
export async function createWallet(onProgress: (s: WalletStep) => void): Promise<{ address: string }> { return isMockMode ? mock.createWallet(onProgress) : live.createWallet(onProgress); }

// Wallet
export async function getAccount(): Promise<Account> { return isMockMode ? mock.getAccount() : live.getAccount(); }
export async function getBalance(): Promise<{ usdc: string; eth: string }> { return isMockMode ? mock.getBalance() : live.getBalance(); }
export async function checkTransfer(i: { to: string; amountUsdc: string }): Promise<TransferCheck> { return isMockMode ? mock.checkTransfer(i) : live.checkTransfer(i); }
export async function sendUsdc(i: { to: string; amountUsdc: string }, onUpdate: (t: TxView) => void): Promise<TxView> { return isMockMode ? mock.sendUsdc(i, onUpdate) : live.sendUsdc(i, onUpdate); }
export async function getTx(requestId: string): Promise<TxView> { return isMockMode ? mock.getTx(requestId) : live.getTx(requestId); }
export async function cancelTx(requestId: string): Promise<void> { return isMockMode ? mock.cancelTx(requestId) : live.cancelTx(requestId); }
export async function getActivity(): Promise<ActivityItem[]> { return isMockMode ? mock.getActivity() : live.getActivity(); }
export async function getAlerts(): Promise<Alert[]> { return isMockMode ? mock.getAlerts() : live.getAlerts(); }

// Swissquote and applications
export async function getSwissquoteAccount(): Promise<{ cashChf: string }> { return isMockMode ? mock.getSwissquoteAccount() : live.getSwissquoteAccount(); }
export async function transferFromSwissquote(amountUsdc: string): Promise<{ txHash: string; explorerUrl: string }> { return isMockMode ? mock.transferFromSwissquote(amountUsdc) : live.transferFromSwissquote(amountUsdc); }
export async function simulateApp(i: { spender: string; amountUsdc: string | "unlimited" }): Promise<{ appName: string | null; known: boolean; unlimited: boolean; plainText: string }> { return isMockMode ? mock.simulateApp(i) : live.simulateApp(i); }
export async function approveApp(i: { spender: string; amountUsdc: string | "unlimited" }, onUpdate: (t: TxView) => void): Promise<TxView> { return isMockMode ? mock.approveApp(i, onUpdate) : live.approveApp(i, onUpdate); }

// Security
export async function createExitKit(passphrase: string): Promise<Blob> { return isMockMode ? mock.createExitKit(passphrase) : live.createExitKit(passphrase); }
export async function revokeDevice(deviceId: string): Promise<void> { return isMockMode ? mock.revokeDevice(deviceId) : live.revokeDevice(deviceId); }

// Recovery (new phone)
export async function startRecovery(): Promise<{ recoveryId: string }> { return isMockMode ? mock.startRecovery() : live.startRecovery(); }
export async function verifyIdentity(recoveryId: string, i: { bankingAnswer: string }): Promise<{ verified: boolean }> { return isMockMode ? mock.verifyIdentity(recoveryId, i) : live.verifyIdentity(recoveryId, i); }
export async function createRecoveryWallet(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> { return isMockMode ? mock.createRecoveryWallet(recoveryId, onProgress) : live.createRecoveryWallet(recoveryId, onProgress); }
export async function getRecovery(recoveryId: string): Promise<RecoveryView> { return isMockMode ? mock.getRecovery(recoveryId) : live.getRecovery(recoveryId); }
export async function cancelRecovery(recoveryId: string): Promise<void> { return isMockMode ? mock.cancelRecovery(recoveryId) : live.cancelRecovery(recoveryId); }
export async function executeRecovery(recoveryId: string): Promise<{ txHash: string; explorerUrl: string }> { return isMockMode ? mock.executeRecovery(recoveryId) : live.executeRecovery(recoveryId); }
/** Additive (docs/CONTRACT_CHANGE.md): second tap of the recovery key on phones whose passkey cannot return the PRF secret at creation. */
export async function continueRecoveryWallet(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> { return isMockMode ? mock.createRecoveryWallet(recoveryId, onProgress) : live.continueRecoveryWallet(recoveryId, onProgress); }
