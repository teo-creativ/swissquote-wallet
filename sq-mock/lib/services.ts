// Business rules of the "Services" routes (CDC annex A.3). Pure functions of (deps, input): routes only authenticate and
// forward. Nothing here returns a password hash, a key or share material.
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";
import { appendAudit } from "./audit";
import type { Chain } from "./chain";
import type { Config } from "./config";
import { ApiError } from "./errors";
import { hashPassword, verifyPassword } from "./passwords";
import { SANCTIONS_LIST_VERSION } from "./seed";
import type { Store } from "./store";
import type { Client } from "./types";

export type Deps = {
  store: Store; chain: Chain; config: Config; now: Date; sleep: (ms: number) => Promise<void>;
  /** Server environment (secrets such as SQ_SHARE_ENC_KEY). Defaults to process.env; tests inject their own. */
  env?: Record<string, string | undefined>;
};
export type Input = Record<string, unknown>;

const DAY_MS = 24 * 60 * 60 * 1000;
export const PROOF_MAX_AGE_MS = 10 * 60 * 1000;
const PROOF_MAX_FUTURE_MS = 60 * 1000;
export const TRANSFER_MAX_USDC = 10_000_000n; // 10 USDC in base units
export const TRANSFER_MAX_PER_DAY = 3;
export const CHF_PER_USDC = 0.88; // simulated rate

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROOF_MESSAGE = /^I confirm I own the wallet (0x[0-9a-fA-F]{40})\. Client ([0-9a-fA-F-]{36})\. (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)\.$/;
// Hash of a throwaway value, so an unknown client costs the same scrypt work as a wrong password.
const DUMMY_HASH = hashPassword("unknown-client-timing-pad");

const invalid = (message: string) => new ApiError(400, "INVALID_INPUT", message);

export function text(input: Input, key: string, max = 200): string {
  const v = input[key];
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw invalid(`Field ${key} is missing or invalid.`);
  return v;
}
export function address(input: Input, key = "address"): Address {
  const v = text(input, key);
  if (!isAddress(v, { strict: false })) throw invalid(`Field ${key} is not a valid address.`);
  return v;
}
export const lower = (a: string) => a.toLowerCase();
export const since24h = (now: Date) => new Date(now.getTime() - DAY_MS).toISOString();

export async function clientBySqRef(store: Store, input: Input): Promise<Client> {
  const sqRef = text(input, "sqRef");
  const client = UUID.test(sqRef) ? await store.getClientBySqRef(sqRef.toLowerCase()) : null;
  if (!client) throw new ApiError(404, "UNKNOWN_CLIENT", "Unknown client reference.");
  return client;
}

export async function login({ store }: Deps, input: Input) {
  const clientId = text(input, "clientId");
  const password = text(input, "password");
  const client = await store.getClient(clientId);
  if (!verifyPassword(password, client?.passwordHash ?? DUMMY_HASH) || !client) throw new ApiError(401, "INVALID_CREDENTIALS", "Wrong client number or password.");
  return { sqRef: client.sqRef, displayName: client.name, kycStatus: client.kycStatus, simulated: true };
}

export async function kyc({ store, config, now, sleep }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  await sleep(config.kycDelayMs); // simulated ID document, selfie and banking question
  await store.updateClient(client.clientId, { kycStatus: "verified", kycCheckedAt: now.toISOString() });
  await appendAudit(store, "KYC_VERIFIED", { clientId: client.clientId, simulated: true }, now);
  return { kycStatus: "verified", simulated: true };
}

export async function bankAccount({ store }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  return { cashChf: client.cashChf, simulated: true };
}

export async function ownershipProof({ store, now }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  const addr = address(input);
  const message = text(input, "message", 300);
  const signature = text(input, "signature", 140);
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw invalid("Field signature is not a 65 byte hex signature.");

  const m = PROOF_MESSAGE.exec(message);
  if (!m) throw new ApiError(400, "INVALID_MESSAGE", "The message does not follow the ownership proof template.");
  const [, msgAddress, msgSqRef, msgDate] = m;
  if (msgAddress !== addr) throw new ApiError(400, "ADDRESS_MISMATCH", "The address in the message is not the submitted address.");
  if (msgSqRef !== client.sqRef) throw new ApiError(400, "CLIENT_MISMATCH", "The client reference in the message is not the submitted one.");
  const age = now.getTime() - Date.parse(msgDate);
  if (Number.isNaN(age) || age < -PROOF_MAX_FUTURE_MS) throw new ApiError(400, "INVALID_DATE", "The date in the message is not valid.");
  if (age > PROOF_MAX_AGE_MS) throw new ApiError(410, "PROOF_EXPIRED", "The ownership proof is older than 10 minutes.");

  const stored = lower(addr);
  const existing = await store.getLinkByAddress(stored);
  if (existing && existing.clientId !== client.clientId) throw new ApiError(409, "ADDRESS_ALREADY_LINKED", "This address is linked to another client.");

  const verified = await verifyMessage({ address: getAddress(addr), message, signature: signature as Hex }).catch(() => false);
  const createdAt = now.toISOString();
  await store.addProof({ clientId: client.clientId, address: stored, message, signature, method: "ECDSA", verified, createdAt });
  if (verified && !existing) await store.addLink({ clientId: client.clientId, address: stored, linkedAt: createdAt });
  await appendAudit(store, verified ? "OWNERSHIP_PROOF_VERIFIED" : "OWNERSHIP_PROOF_REJECTED", { clientId: client.clientId, address: stored }, now);
  return { verified, method: "ECDSA" };
}

export async function resolveAccount({ store }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  const link = await store.getLatestLink(client.clientId);
  if (!link) throw new ApiError(404, "NO_WALLET_LINKED", "No wallet is linked to this client.");
  return { address: getAddress(link.address) };
}

export async function transferToWallet({ store, chain, now }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  const raw = text(input, "amountUsdc", 20);
  if (!/^[1-9]\d*$/.test(raw)) throw invalid("Field amountUsdc must be a positive integer string in base units.");
  const amount = BigInt(raw);
  if (amount > TRANSFER_MAX_USDC) throw new ApiError(400, "AMOUNT_ABOVE_LIMIT", "The maximum is 10 USDC per transfer.");

  const link = await store.getLatestLink(client.clientId);
  if (!link) throw new ApiError(403, "OWNERSHIP_PROOF_REQUIRED", "A verified ownership proof is required before a transfer.");
  if (await store.getSanction(link.address)) throw new ApiError(403, "SANCTIONED_ADDRESS", "Transfers to this address are blocked.");
  if ((await store.countTransfersSince(client.clientId, since24h(now))) >= TRANSFER_MAX_PER_DAY)
    throw new ApiError(429, "DAILY_LIMIT_REACHED", "The maximum is 3 transfers per 24 hours.");
  const debitChf = Math.round((Number(amount) / 1e6) * CHF_PER_USDC * 100) / 100;
  if (client.cashChf < debitChf) throw new ApiError(409, "INSUFFICIENT_FUNDS", "The cash balance is too low.");

  const txHash = await chain.sendUsdc(getAddress(link.address), amount);
  await store.addTransfer({ clientId: client.clientId, address: link.address, amountUsdc: raw, txHash, createdAt: now.toISOString() });
  await store.updateClient(client.clientId, { cashChf: Math.round((client.cashChf - debitChf) * 100) / 100 });
  await appendAudit(store, "TRANSFER_TO_WALLET", { clientId: client.clientId, address: link.address, amountUsdc: raw, debitChf, txHash }, now);
  // The USDC transfer is real (Base Sepolia). The CHF account and the rate are simulated.
  return { txHash, debitedChf: debitChf, bankDebitSimulated: true };
}

export type GasSkip = "UNKNOWN_ADDRESS" | "SANCTIONED_ADDRESS" | "ALREADY_DRIPPED_24H" | "DAILY_CAP_REACHED" | "BALANCE_ABOVE_THRESHOLD";

/** Gas pre-funding (CDC 3.6). Not an ERC-4337 paymaster: a small fixed test ETH top-up paid by the gas account. */
export async function gasDrip({ store, chain, config, now }: Deps, input: Input): Promise<{ txHash: Hex } | { skipped: GasSkip }> {
  const addr = address(input);
  const stored = lower(addr);
  if (!(await store.getLinkByAddress(stored))) return { skipped: "UNKNOWN_ADDRESS" };
  if (await store.getSanction(stored)) return { skipped: "SANCTIONED_ADDRESS" };
  const since = since24h(now);
  if ((await store.countGasDripsSince(since, stored)) >= 1) return { skipped: "ALREADY_DRIPPED_24H" };
  if ((await store.countGasDripsSince(since)) >= config.gasDripDailyCap) return { skipped: "DAILY_CAP_REACHED" };
  if ((await chain.getEthBalance(getAddress(addr))) >= config.gasDripMinBalanceWei) return { skipped: "BALANCE_ABOVE_THRESHOLD" };

  const txHash = await chain.sendGas(getAddress(addr), config.gasDripWei);
  await store.addGasDrip({ address: stored, amountWei: config.gasDripWei.toString(), txHash, createdAt: now.toISOString() });
  await appendAudit(store, "GAS_DRIP", { address: stored, amountWei: config.gasDripWei.toString(), txHash }, now);
  return { txHash };
}

export async function complianceScreen({ store }: Deps, input: Input) {
  const listVersion = await store.getSanction(lower(address(input)));
  return { sanctioned: listVersion !== null, listVersion: listVersion ?? SANCTIONS_LIST_VERSION, simulated: true };
}

export async function complianceAlert({ store, now }: Deps, input: Input) {
  const alert = { account: text(input, "account"), target: text(input, "target"), reason: text(input, "reason") };
  await store.addComplianceAlert({ ...alert, createdAt: now.toISOString() });
  await appendAudit(store, "COMPLIANCE_ALERT", alert, now);
  return { logged: true };
}

export async function alertsCall({ store, now }: Deps, input: Input) {
  const client = await clientBySqRef(store, input);
  const reason = text(input, "reason");
  await store.addCall({ clientId: client.clientId, reason, createdAt: now.toISOString() });
  await appendAudit(store, "SIMULATED_CALL", { clientId: client.clientId, reason, simulated: true }, now);
  return { logged: true, simulated: true };
}
