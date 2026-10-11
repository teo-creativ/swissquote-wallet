// Live bodies behind lib/sqkeys.ts (NEXT_PUBLIC_SQKEYS_MODE=live). Same signatures as the mock. The browser holds P1 and signs; the server
// (app/api/live/*) talks to the lawyer node and to Swissquote; the wallet is a Safe 2-of-3 smart account on Base Sepolia (not MPC).
import { getAddress, type Hex } from "viem";
import { fromBase, toBase } from "@/lib/amounts";
import { safeTxHash, usdcTransferTx } from "@/lib/shared/safe";
import { SqKeysError } from "@/lib/sqkeys.types";
import type { Account, AccountStatus, ActivityItem, Alert, Device, RecoveryView, TransferCheck, TxView, WalletStep } from "@/lib/sqkeys.types";
import { PasskeyError, b64uDecode, b64uEncode, createPasskey, fetchPublicConfig, getPasskey, prepareChallenge, randomBytes } from "@/lib/passkey/webauthn";
import { call, sleep } from "./api";
import { sealAfterPrf } from "./ceremony";
import { promotePending, readMeta, unlockP1 } from "./p1";

const notInLive = (what: string) => new SqKeysError("NOT_AVAILABLE", `${what} is not available in this version.`);

// ---------------------------------------------------------------- onboarding
export const loginSwissquote = (clientId: string, password: string) => call<{ displayName: string; kycStatus: string; accountStatus: AccountStatus }>("login", { clientId, password });
export const logout = async (): Promise<void> => {
  await call("logout");
};

export async function runKyc(onProgress: (step: "document" | "selfie" | "banking_question") => void): Promise<void> {
  // The identity check is simulated (and says so on screen). The steps are shown one by one while the server records the result.
  const done = call("kyc").then(() => null, (e: unknown) => e);
  for (const step of ["document", "selfie", "banking_question"] as const) {
    onProgress(step);
    await sleep(900);
  }
  const failure = await done;
  if (failure) throw failure;
}

export async function registerAccount(consents: { document: "terms" | "risk" | "recovery" | "privacy"; version: string }[]): Promise<void> {
  await call("register", { consents });
}

/** The key screen already ran the passkey ceremony and stored P1 wrapped on this phone; here the public address is registered. */
export async function createDevicePasskey(label: string): Promise<Device> {
  const meta = readMeta("current");
  if (!meta) throw new SqKeysError("PRF_NOT_SUPPORTED", "This phone cannot protect your key with a passkey. Try another phone or browser.");
  const device = await call<Device>("device-register", { label, ownerAddress: meta.address, credentialId: meta.credentialId, prfSupported: meta.level === "prf" });
  return { ...device, current: true };
}

export const inviteLawyer = (clientDisplayName: string) => call<{ inviteUrl: string; expiresAt: string }>("invite", { clientDisplayName });
export const getLawyerStatus = () => call<{ status: "none" | "invited" | "accepted"; displayName?: string; expiresAt?: string }>("lawyer-status");

export async function createWallet(onProgress: (s: WalletStep) => void): Promise<{ address: string }> {
  onProgress("preparing");
  const local = readMeta("current");
  onProgress("creating_keys");
  const owners = await call<{ p1: string; p2: string; p3: string }>("wallet-owners");
  onProgress("checking_keys");
  const distinct = new Set([owners.p1, owners.p2, owners.p3].map((a) => a.toLowerCase())).size === 3;
  if (!distinct || (local && local.address.toLowerCase() !== owners.p1.toLowerCase())) throw new SqKeysError("KEY_MISMATCH", "The keys do not match. Nothing was created. Start again.");
  onProgress("saving_key_on_device");
  onProgress("linking_wallet");
  const wallet = await call<{ address: string }>("wallet-deploy");
  onProgress("funding_gas");
  onProgress("done");
  return { address: wallet.address };
}

// ---------------------------------------------------------------- wallet
export async function getAccount(): Promise<Account> {
  const account = await call<any>("account");
  const mine = readMeta("current")?.address.toLowerCase();
  const devices: Device[] = (account.devices as (Device & { ownerAddress?: string })[]).map(({ ownerAddress, ...d }) => ({ ...d, current: Boolean(mine && ownerAddress && ownerAddress.toLowerCase() === mine) }));
  return { ...account, devices } as Account;
}
export const getBalance = () => call<{ usdc: string; eth: string }>("balance");
export const checkTransfer = (i: { to: string; amountUsdc: string }) => call<TransferCheck>("transfer-check", i);

/**
 * Send USDC. The passkey prompt starts FIRST (iOS needs it inside the tap), while the server prepares the Safe transaction. The browser then
 * rebuilds the hash itself and refuses to sign anything that is not exactly what the user typed. P1 signs; the lawyer node decides; the
 * sponsor pays the gas. Resolves the first status the server reports; the next screens follow the request with getTx.
 */
export async function sendUsdc(i: { to: string; amountUsdc: string }, onUpdate: (t: TxView) => void): Promise<TxView> {
  const unlocking = unlockP1("current");
  const preparing = call<{ requestId: string; safeAddress: string; to: string; amountBase: string; nonce: string; safeTxHash: Hex; usdc: string; chainId: number }>("transfer-prepare", i);
  const outcome = await Promise.allSettled([unlocking, preparing]);
  if (outcome[0].status === "rejected") throw outcome[0].reason;
  if (outcome[1].status === "rejected") throw outcome[1].reason;
  const signer = outcome[0].value;
  const prep = outcome[1].value;

  const expected = safeTxHash({ safe: getAddress(prep.safeAddress), tx: usdcTransferTx(getAddress(prep.usdc), getAddress(i.to), BigInt(toBase(i.amountUsdc))), nonce: BigInt(prep.nonce), chainId: prep.chainId });
  if (expected !== prep.safeTxHash || getAddress(prep.to) !== getAddress(i.to) || prep.amountBase !== toBase(i.amountUsdc)) {
    throw new SqKeysError("TAMPERED", "The transfer did not match what you entered. Nothing was signed.");
  }
  const p1Signature = await signer.signHash(expected);
  const view = await call<TxView>("transfer-submit", { requestId: prep.requestId, p1Signature });
  onUpdate(view);
  return view;
}

export const getTx = (requestId: string) => call<TxView>("transfer-status", { requestId });
export const cancelTx = async (requestId: string): Promise<void> => {
  await call("transfer-cancel", { requestId });
};
export const getActivity = () => call<ActivityItem[]>("activity");
export const getAlerts = () => call<Alert[]>("alerts");

// ---------------------------------------------------------------- Swissquote and applications
export const getSwissquoteAccount = () => call<{ cashChf: string }>("swissquote-account");
export const transferFromSwissquote = (amountUsdc: string) => call<{ txHash: string; explorerUrl: string }>("swissquote-transfer", { amountUsdc });
export async function simulateApp(..._args: unknown[]): Promise<never> {
  throw notInLive("Connecting apps");
}
export async function approveApp(..._args: unknown[]): Promise<never> {
  throw notInLive("Connecting apps");
}

// ---------------------------------------------------------------- security
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

/**
 * The exit kit: your phone key P1, encrypted with a passphrase you choose (PBKDF2-SHA256 600,000 rounds + AES-256-GCM, WebCrypto),
 * with the public facts needed to use it. Moving funds without Swissquote also needs your lawyer's approval (P1 + P2).
 */
export async function createExitKit(passphrase: string): Promise<Blob> {
  if (passphrase.length < 8) throw new SqKeysError("WEAK_PASSPHRASE", "Choose a passphrase of at least 8 characters.");
  const unlocking = unlockP1("current"); // starts the passkey prompt first
  const [signer, info] = await Promise.all([unlocking, call<{ safeAddress: string; p2Address: string; p3Address: string; chainId: number; usdc: string; explorerUrl: string }>("exit-kit-info")]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const secret = new TextEncoder().encode(signer.exportKey());
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(`sqkeys-exit-kit|${info.safeAddress.toLowerCase()}`) }, key, secret));
  secret.fill(0);
  await call("exit-kit-record");
  const kit = {
    format: "sqkeys-exit-kit/v1",
    createdAt: new Date().toISOString(),
    custody: "Safe 2-of-3 smart account (not MPC). Owners: P1 your phone key, P2 your lawyer, P3 Swissquote. Any two of them can move funds.",
    network: { name: "Base Sepolia (testnet)", chainId: info.chainId, usdc: info.usdc, explorer: info.explorerUrl },
    safeAddress: info.safeAddress,
    owners: { p1: signer.address, p2: info.p2Address, p3: info.p3Address },
    p1KeyEncrypted: { kdf: "PBKDF2-SHA256", iterations: 600_000, salt: b64(salt), cipher: "AES-256-GCM", iv: b64(iv), aad: `sqkeys-exit-kit|${info.safeAddress.toLowerCase()}`, ciphertext: b64(ct) },
    howTo: [
      "Without Swissquote you need two owners: your phone key P1 (this file, unlocked with your passphrase) and your lawyer P2.",
      "Ask your lawyer to approve an exit request in their portal, wait for the exit delay, then sign the Safe transaction with P1 and the lawyer's signature.",
      "Keep this file offline. Anyone with the file and your passphrase holds your P1 key.",
    ],
  };
  return new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
}

export async function revokeDevice(..._args: unknown[]): Promise<void> {
  throw notInLive("Removing a phone key (it needs a recovery, which replaces the key on the wallet)");
}

// ---------------------------------------------------------------- recovery (new phone)
export const startRecovery = () => call<{ recoveryId: string }>("recovery-start");
export const verifyIdentity = (recoveryId: string, i: { bankingAnswer: string }) => call<{ verified: boolean }>("recovery-verify", { recoveryId, ...i });

async function attachNewKey(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> {
  const meta = readMeta("pending");
  if (!meta) throw new SqKeysError("NO_KEY_ON_DEVICE", "The new key was not created. Try again.");
  onProgress("linking_wallet");
  const res = await call<{ newAddress: string }>("recovery-attach", { recoveryId, ownerAddress: meta.address, credentialId: meta.credentialId });
  onProgress("funding_gas");
  onProgress("done");
  return res;
}

/** Creates the passkey and the new key P1' on this phone, then asks the lawyer to approve. Starts the passkey prompt first (iOS). */
export function createRecoveryWallet(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> {
  const prepared = prepareChallenge();
  const config = fetchPublicConfig();
  onProgress("preparing");
  return createPasskey(prepared, "SQ Keys client", { test: false }).then(async (r) => {
    onProgress("creating_keys");
    if (r.plan === "needs_second_tap") {
      localStorage.setItem("sqkeys.p1.pendingCredential", b64uEncode(r.credentialId));
      throw new SqKeysError("SECOND_TAP_REQUIRED", "Confirm once more to protect your key.");
    }
    onProgress("saving_key_on_device");
    await sealAfterPrf({ slot: "pending", credentialId: r.credentialId, prfOutput: r.prfOutput, allowNoPrf: (await config).allowNoPrf });
    return attachNewKey(recoveryId, onProgress);
  }, (e: unknown) => {
    throw e instanceof PasskeyError ? new SqKeysError("PASSKEY_FAILED", e.info.message) : e;
  });
}

/**
 * Second tap of the recovery key, for phones whose passkey cannot return the PRF secret at creation. Added to the contract (additive):
 * the screen calls it from its own button when createRecoveryWallet fails with SECOND_TAP_REQUIRED.
 */
export function continueRecoveryWallet(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> {
  const stored = localStorage.getItem("sqkeys.p1.pendingCredential");
  if (!stored) return Promise.reject(new SqKeysError("NO_KEY_ON_DEVICE", "The new key was not created. Try again."));
  const credentialId = b64uDecode(stored);
  const config = fetchPublicConfig();
  return getPasskey(credentialId, randomBytes(32), true).then(async (r) => {
    onProgress("saving_key_on_device");
    await sealAfterPrf({ slot: "pending", credentialId, prfOutput: r.prfOutput, allowNoPrf: (await config).allowNoPrf });
    localStorage.removeItem("sqkeys.p1.pendingCredential");
    return attachNewKey(recoveryId, onProgress);
  }, (e: unknown) => {
    throw e instanceof PasskeyError ? new SqKeysError("PASSKEY_FAILED", e.info.message) : e;
  });
}

export const getRecovery = (recoveryId: string) => call<RecoveryView>("recovery-status", { recoveryId });
export const cancelRecovery = async (recoveryId: string): Promise<void> => {
  await call("recovery-cancel", { recoveryId });
};

export async function executeRecovery(recoveryId: string): Promise<{ txHash: string; explorerUrl: string }> {
  const res = await call<{ txHash: string; explorerUrl: string }>("recovery-execute", { recoveryId });
  await promotePending(); // the new phone key is now the one that owns the wallet
  return res;
}

export { fromBase };
