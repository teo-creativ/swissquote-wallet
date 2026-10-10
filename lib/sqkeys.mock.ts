// Mock implementation of lib/sqkeys.ts (CDC annex D.1): realistic delays, in-memory state persisted in sessionStorage.
// Nothing here talks to a server, touches a key or moves funds. Time-driven steps (lawyer decision, signing,
// recovery delay) are computed lazily from timestamps, so they keep progressing across page reloads.
import { fromBase, toBase } from "./amounts";
import { DEFAULT_POLICY, UNLIMITED_BASE, evaluatePolicy } from "./sqkeys.mock.policy";
import type { PolicyDecision, PolicyKind } from "./sqkeys.mock.policy";
import { SqKeysError } from "./sqkeys.types";
import type { Account, AccountStatus, ActivityItem, Alert, Device, Reason, RecoveryView, TransferCheck, TxStatus, TxView, WalletStep } from "./sqkeys.types";

// ---------------------------------------------------------------- constants
const STORAGE_KEY = "sqkeys.mock.v1";
const DEMO_CLIENT_ID = "client.lea";
const DEMO_PASSWORD = "demo1234";
const DISPLAY_NAME = "Léa Müller";
const LAWYER_NAME = "Camille Dubois";
const INVITE_TTL_MS = 7 * 24 * 3_600_000;
const REQUEST_TTL_MS = 48 * 3_600_000; // CDC 8.2 requestTtlSeconds (production value)
const AUTO_LAWYER_MS = 8_000;
const RECOVERY_DELAY_MS = 120_000; // demo delay (CDC F.1)
const SKIP_MS = RECOVERY_DELAY_MS;
const SWISSQUOTE_PER_TRANSFER_BASE = 10_000_000n; // F.4: 10 USDC per transfer, 3 per day (demo)
const SWISSQUOTE_PER_DAY = 3;
const CHF_CENTS_PER_USDC = 90n;
const DAY_MS = 24 * 3_600_000;
const EXPLORER = "https://sepolia.basescan.org/tx/";
const DEMO_APPROVED_RECIPIENT = "0x5aa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3";
/** Demo apps the mock "knows" (approved app list). */
const KNOWN_APPS: Record<string, string> = {
  "0x00000000000000000000000000000000000d0001": "Demo Swap",
  "0x00000000000000000000000000000000000d0002": "Demo Lend",
};

// ---------------------------------------------------------------- state
interface TxRecord {
  id: string;
  kind: "transfer" | "approve";
  to: string;
  amountBase: string;
  appName: string | null;
  status: TxStatus;
  outcome: TxView["outcome"];
  reasons: Reason[];
  createdAt: number;
  statusSince: number;
  approvalExpiresAt?: number;
  txHash?: string;
  reserved: boolean;
}

interface RecoveryRecord {
  id: string;
  oldAddress: string;
  newAddress?: string;
  identityVerified: boolean;
  identityFailed: boolean;
  identityVerifiedAt?: number;
  releaseAfter?: number;
  lawyerStatus: RecoveryView["lawyerStatus"];
  cancelledBy?: string;
  executed: boolean;
}

interface MockState {
  v: 1;
  loggedIn: boolean;
  kycVerified: boolean;
  consents: { document: string; version: string }[];
  status: AccountStatus;
  address: string | null;
  devices: Device[];
  invite: { token: string; clientName: string; createdAt: number; expiresAt: number; accepted: boolean } | null;
  exitKitCreatedAt: string | null;
  usdcBase: string;
  eth: string;
  cashChfCents: string;
  approvedRecipients: string[];
  autoDecisions: { at: number; amountBase: string; txId: string }[];
  deposits: number[];
  txs: TxRecord[];
  activity: ActivityItem[];
  alerts: Alert[];
  recoveries: RecoveryRecord[];
  activeRecoveryId: string | null;
  panel: MockPanel;
}

export interface MockPanel {
  /** The simulated lawyer approves requests and invitations by itself after 8 s. */
  autoLawyer: boolean;
  /** Result of the simulated identity check during recovery. */
  identityPass: boolean;
}

function initialState(panel: MockPanel = { autoLawyer: true, identityPass: true }): MockState {
  return {
    v: 1,
    loggedIn: false,
    kycVerified: false,
    consents: [],
    status: "created",
    address: null,
    devices: [],
    invite: null,
    exitKitCreatedAt: null,
    usdcBase: "0",
    eth: "0.0000",
    cashChfCents: "1816500",
    approvedRecipients: [DEMO_APPROVED_RECIPIENT],
    autoDecisions: [],
    deposits: [],
    txs: [],
    activity: [],
    alerts: [],
    recoveries: [],
    activeRecoveryId: null,
    panel,
  };
}

let current: MockState | null = null;

function load(): MockState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockState;
      if (parsed?.v === 1) return parsed;
    }
  } catch {
    /* sessionStorage unavailable (SSR, tests, private mode): memory only */
  }
  return initialState();
}

function state(): MockState {
  current ??= load();
  return current;
}

function save(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state()));
  } catch {
    /* memory only */
  }
}

// ---------------------------------------------------------------- helpers
const sleep = (min = 300, max = 1500) => new Promise<void>((resolve) => setTimeout(resolve, min + Math.random() * (max - min)));
const iso = (ms: number) => new Date(ms).toISOString();
const shorten = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const isAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}
const newId = (prefix: string) => `${prefix}_${randomHex(5)}`;
const newAddress = () => `0x${randomHex(20)}`;
const newTxHash = () => `0x${randomHex(32)}`;

function requireAuth(): MockState {
  const s = state();
  if (!s.loggedIn) throw new SqKeysError("NOT_AUTHENTICATED", "Sign in with your Swissquote account.");
  return s;
}

function requireWallet(): MockState {
  const s = requireAuth();
  if (!s.address) throw new SqKeysError("NO_WALLET", "Create your wallet first.");
  return s;
}

function parseAmount(amountUsdc: string): bigint {
  try {
    return BigInt(toBase(amountUsdc));
  } catch {
    throw new SqKeysError("INVALID_AMOUNT", "Enter a valid amount.");
  }
}

function assertAddress(address: string): void {
  if (!isAddress(address)) throw new SqKeysError("INVALID_ADDRESS", "Enter a valid address.");
}

function addActivity(s: MockState, item: ActivityItem): void {
  const i = s.activity.findIndex((a) => a.id === item.id);
  if (i >= 0) s.activity[i] = item;
  else s.activity.unshift(item);
}

function addAlert(s: MockState, kind: string, message: string): void {
  s.alerts.unshift({ id: newId("alr"), kind, message, createdAt: iso(Date.now()), read: false });
}

function security(s: MockState, title: string): void {
  addActivity(s, { id: newId("sec"), kind: "security", title, at: iso(Date.now()) });
}

function lawyerStatus(s: MockState): "none" | "invited" | "accepted" {
  return s.invite ? (s.invite.accepted ? "accepted" : "invited") : "none";
}

// ---------------------------------------------------------------- transactions (lazy state machine)
const TERMINAL: TxStatus[] = ["confirmed", "refused", "expired", "cancelled", "failed"];
const CANCELLABLE: TxStatus[] = ["evaluating", "pending_lawyer", "approved"];

function txView(tx: TxRecord): TxView {
  const sent = tx.status === "broadcast" || tx.status === "confirmed";
  return {
    requestId: tx.id,
    status: tx.status,
    outcome: tx.outcome,
    reasons: tx.reasons,
    ...(tx.status === "pending_lawyer" && tx.approvalExpiresAt ? { approvalExpiresAt: iso(tx.approvalExpiresAt) } : {}),
    ...(sent && tx.txHash ? { txHash: tx.txHash, explorerUrl: EXPLORER + tx.txHash } : {}),
  };
}

function syncTxActivity(s: MockState, tx: TxRecord): void {
  const unlimited = BigInt(tx.amountBase) >= UNLIMITED_BASE;
  const sent = tx.status === "broadcast" || tx.status === "confirmed";
  addActivity(s, {
    id: tx.id,
    kind: tx.kind === "transfer" ? "transfer_out" : "approval",
    title: tx.kind === "transfer" ? `To ${shorten(tx.to)}` : `Allowed ${tx.appName ?? shorten(tx.to)}`,
    ...(unlimited ? {} : { amountUsdc: fromBase(tx.amountBase) }),
    counterparty: tx.to,
    at: iso(tx.createdAt),
    status: tx.status,
    ...(sent && tx.txHash ? { txHash: tx.txHash, explorerUrl: EXPLORER + tx.txHash } : {}),
  });
}

function setStatus(s: MockState, tx: TxRecord, status: TxStatus, since: number): void {
  tx.status = status;
  tx.statusSince = since;
  syncTxActivity(s, tx);
}

function finishTx(s: MockState, tx: TxRecord, status: "refused" | "expired" | "cancelled" | "failed"): void {
  if (tx.reserved) {
    s.autoDecisions = s.autoDecisions.filter((d) => d.txId !== tx.id); // an unused reservation is released (CDC 8.4)
    tx.reserved = false;
  }
  setStatus(s, tx, status, Date.now());
  if (status === "refused" && tx.outcome === "LAWYER") addAlert(s, "tx_declined", "Your lawyer declined this transfer. Nothing was sent.");
  if (status === "expired") addAlert(s, "tx_expired", "This request expired. Nothing was sent.");
}

function approveTx(s: MockState, tx: TxRecord): void {
  if (tx.kind === "transfer" && tx.reasons.includes("NEW_RECIPIENT")) {
    const to = tx.to.toLowerCase();
    if (!s.approvedRecipients.includes(to)) s.approvedRecipients.push(to); // "Add this recipient to known recipients" (checked)
  }
  setStatus(s, tx, "approved", Date.now());
}

function tickTx(s: MockState, tx: TxRecord): void {
  for (;;) {
    const t = Date.now();
    const age = t - tx.statusSince;
    if (tx.status === "evaluating" && age >= 600) {
      const next = tx.outcome === "AUTO" ? "approved" : tx.outcome === "LAWYER" ? "pending_lawyer" : "refused";
      if (next === "refused") finishTx(s, tx, "refused");
      else setStatus(s, tx, next, tx.statusSince + 600);
    } else if (tx.status === "pending_lawyer") {
      if (tx.approvalExpiresAt && t > tx.approvalExpiresAt) finishTx(s, tx, "expired");
      else if (s.panel.autoLawyer && age >= AUTO_LAWYER_MS) approveTx(s, tx);
      return;
    } else if (tx.status === "approved" && age >= 500) {
      setStatus(s, tx, "signing", tx.statusSince + 500);
    } else if (tx.status === "signing" && age >= 1000) {
      tx.txHash = newTxHash();
      setStatus(s, tx, "broadcast", tx.statusSince + 1000);
    } else if (tx.status === "broadcast" && age >= 1200) {
      const amount = BigInt(tx.amountBase);
      if (tx.kind === "transfer" && amount > BigInt(s.usdcBase)) {
        finishTx(s, tx, "failed");
      } else {
        if (tx.kind === "transfer") s.usdcBase = (BigInt(s.usdcBase) - amount).toString();
        setStatus(s, tx, "confirmed", tx.statusSince + 1200);
      }
    } else {
      return;
    }
  }
}

function tickRecovery(s: MockState, r: RecoveryRecord): void {
  if (r.cancelledBy || r.executed || !r.identityVerified || r.lawyerStatus !== "pending") return;
  if (s.panel.autoLawyer && r.identityVerifiedAt !== undefined && Date.now() - r.identityVerifiedAt >= AUTO_LAWYER_MS) {
    r.lawyerStatus = "approved";
  }
}

function tick(): MockState {
  const s = state();
  for (const tx of s.txs) if (!TERMINAL.includes(tx.status)) tickTx(s, tx);
  for (const r of s.recoveries) tickRecovery(s, r);
  if (s.invite && !s.invite.accepted && s.panel.autoLawyer && Date.now() - s.invite.createdAt >= AUTO_LAWYER_MS) acceptInvite(s);
  save();
  return s;
}

function acceptInvite(s: MockState): void {
  if (!s.invite || s.invite.accepted) return;
  s.invite.accepted = true;
  if (s.status === "awaiting_lawyer" || s.status === "created") s.status = "ready_for_keys";
  security(s, "Your lawyer accepted.");
}

function recoveryStatus(r: RecoveryRecord): string {
  // identity_pending | identity_failed | identity_verified | waiting | ready | refused | cancelled | completed
  if (r.cancelledBy) return "cancelled";
  if (r.executed) return "completed";
  if (r.identityFailed) return "identity_failed";
  if (!r.identityVerified) return "identity_pending";
  if (r.lawyerStatus === "refused") return "refused";
  if (!r.newAddress) return "identity_verified";
  return r.lawyerStatus === "approved" && r.releaseAfter !== undefined && Date.now() >= r.releaseAfter ? "ready" : "waiting";
}

function findRecovery(s: MockState, id: string): RecoveryRecord {
  const r = s.recoveries.find((x) => x.id === id);
  if (!r) throw new SqKeysError("NOT_FOUND", "Recovery not found.");
  return r;
}

function policyDecision(s: MockState, kind: PolicyKind, to: string, amountBase: bigint, knownApp?: boolean): PolicyDecision {
  const pendingCount = s.txs.filter((t) => t.status === "pending_lawyer" || (t.status === "evaluating" && t.outcome === "LAWYER")).length;
  return evaluatePolicy(
    { kind, to, amountBase, knownApp },
    {
      approvedRecipients: s.approvedRecipients.map((a) => a.toLowerCase()),
      autoDecisions: s.autoDecisions.map((d) => ({ at: d.at, amountBase: BigInt(d.amountBase) })),
      pendingCount,
    },
    DEFAULT_POLICY,
    Date.now(),
  );
}

async function runTx(
  kind: "transfer" | "approve",
  to: string,
  amountBase: bigint,
  appName: string | null,
  knownApp: boolean,
  onUpdate: (t: TxView) => void,
): Promise<TxView> {
  requireWallet();
  await sleep(300, 700);
  let s = tick();
  if (s.activeRecoveryId) {
    const r = s.recoveries.find((x) => x.id === s.activeRecoveryId);
    if (r && r.identityVerified && !r.cancelledBy && !r.executed) {
      throw new SqKeysError("RECOVERY_IN_PROGRESS", "A recovery is in progress. Transfers are paused.");
    }
  }
  if (kind === "transfer" && amountBase > BigInt(s.usdcBase)) throw new SqKeysError("INSUFFICIENT_FUNDS", "Your balance is too low for this transfer.");

  const decision = policyDecision(s, kind === "transfer" ? "usdc_transfer" : "usdc_approve", to, amountBase, knownApp);
  const now = Date.now();
  const tx: TxRecord = {
    id: newId("req"),
    kind,
    to,
    amountBase: amountBase.toString(),
    appName,
    status: "evaluating",
    outcome: decision.outcome,
    reasons: decision.reasons,
    createdAt: now,
    statusSince: now,
    approvalExpiresAt: decision.outcome === "LAWYER" ? now + REQUEST_TTL_MS : undefined,
    reserved: decision.outcome === "AUTO",
  };
  if (tx.reserved) s.autoDecisions.push({ at: now, amountBase: tx.amountBase, txId: tx.id });
  s.txs.push(tx);
  syncTxActivity(s, tx);
  save();

  let last: TxStatus | null = null;
  for (;;) {
    s = tick();
    const cur = s.txs.find((t) => t.id === tx.id) as TxRecord;
    if (cur.status !== last) {
      last = cur.status;
      onUpdate(txView(cur));
    }
    if (TERMINAL.includes(cur.status)) return txView(cur);
    await sleep(250, 350);
  }
}

// ================================================================ API (same signatures as lib/sqkeys.ts)

// ---------------------------------------------------------------- Onboarding
export async function loginSwissquote(clientId: string, password: string): Promise<{ displayName: string; kycStatus: string; accountStatus: AccountStatus }> {
  await sleep(600, 1200);
  if (clientId !== DEMO_CLIENT_ID || password !== DEMO_PASSWORD) throw new SqKeysError("INVALID_CREDENTIALS", "Wrong client ID or password.");
  const s = tick();
  s.loggedIn = true;
  save();
  return { displayName: DISPLAY_NAME, kycStatus: s.kycVerified ? "verified" : "not_started", accountStatus: s.status };
}

export async function logout(): Promise<void> {
  await sleep(300, 500);
  const s = state();
  s.loggedIn = false;
  save();
}

export async function runKyc(onProgress: (step: "document" | "selfie" | "banking_question") => void): Promise<void> {
  requireAuth();
  for (const step of ["document", "selfie", "banking_question"] as const) {
    onProgress(step);
    await sleep(700, 1200);
  }
  state().kycVerified = true;
  save();
}

export async function registerAccount(consents: { document: "terms" | "risk" | "recovery" | "privacy"; version: string }[]): Promise<void> {
  const s = requireAuth();
  await sleep(500, 900);
  const missing = (["terms", "risk", "recovery", "privacy"] as const).filter((d) => !consents.some((c) => c.document === d));
  if (missing.length > 0) throw new SqKeysError("CONSENTS_REQUIRED", "Accept the Terms of use, Risk warning, Recovery terms and Privacy policy to continue.");
  s.consents = consents.map((c) => ({ document: c.document, version: c.version }));
  save();
}

export async function createDevicePasskey(label: string): Promise<Device> {
  const s = requireAuth();
  await sleep(800, 1400);
  if (!label.trim()) throw new SqKeysError("INVALID_LABEL", "Give this phone a name.");
  const device: Device = { id: newId("dev"), label: label.trim(), createdAt: iso(Date.now()), current: true };
  s.devices = [...s.devices.map((d) => ({ ...d, current: false })), device];
  security(s, `Phone key created: ${device.label}`);
  save();
  return device;
}

export async function inviteLawyer(clientDisplayName: string): Promise<{ inviteUrl: string; expiresAt: string }> {
  const s = requireAuth();
  await sleep(500, 900);
  if (s.invite?.accepted) throw new SqKeysError("ALREADY_ACCEPTED", "Your lawyer already accepted.");
  const now = Date.now();
  s.invite = { token: randomHex(16), clientName: clientDisplayName, createdAt: now, expiresAt: now + INVITE_TTL_MS, accepted: false };
  if (s.status === "created") s.status = "awaiting_lawyer";
  save();
  return { inviteUrl: `http://localhost:3001/invite/${s.invite.token}`, expiresAt: iso(s.invite.expiresAt) };
}

export async function getLawyerStatus(): Promise<{ status: "none" | "invited" | "accepted"; displayName?: string; expiresAt?: string }> {
  requireAuth();
  await sleep(300, 600);
  const s = tick();
  const status = lawyerStatus(s);
  return {
    status,
    ...(status === "accepted" ? { displayName: LAWYER_NAME } : {}),
    ...(s.invite && status === "invited" ? { expiresAt: iso(s.invite.expiresAt) } : {}),
  };
}

const WALLET_STEPS: WalletStep[] = ["preparing", "creating_keys", "checking_keys", "saving_key_on_device", "linking_wallet", "funding_gas", "done"];

export async function createWallet(onProgress: (s: WalletStep) => void): Promise<{ address: string }> {
  const s = requireAuth();
  tick();
  if (s.address) return { address: s.address };
  if (!s.invite?.accepted) throw new SqKeysError("LAWYER_NOT_ACCEPTED", "Your lawyer has not accepted yet.");
  s.status = "creating_wallet";
  save();
  for (const step of WALLET_STEPS) {
    onProgress(step);
    if (step !== "done") await sleep(500, 1000);
  }
  s.address = newAddress();
  s.status = "active";
  s.eth = "0.0010";
  security(s, "Wallet created");
  save();
  return { address: s.address };
}

// ---------------------------------------------------------------- Wallet
export async function getAccount(): Promise<Account> {
  requireAuth();
  await sleep(300, 700);
  const s = tick();
  const recovery = s.activeRecoveryId ? s.recoveries.find((r) => r.id === s.activeRecoveryId) : undefined;
  const status = lawyerStatus(s);
  return {
    status: s.status,
    address: s.address,
    lawyer: { status, ...(status === "accepted" ? { displayName: LAWYER_NAME } : {}) },
    devices: s.devices,
    exitKitCreatedAt: s.exitKitCreatedAt,
    recovery: recovery ? { id: recovery.id, status: recoveryStatus(recovery) } : null,
    policy: {
      perTxCap: fromBase(DEFAULT_POLICY.perTxCapBase.toString()),
      dailyCap: fromBase(DEFAULT_POLICY.dailyCapBase.toString()),
      hourlyCount: DEFAULT_POLICY.hourlyCount,
      dailyCount: DEFAULT_POLICY.dailyCount,
      newRecipientRequiresLawyer: DEFAULT_POLICY.newRecipientRequiresLawyer,
      approvedRecipients: s.approvedRecipients,
    },
  };
}

export async function getBalance(): Promise<{ usdc: string; eth: string }> {
  requireWallet();
  await sleep(300, 700);
  const s = tick();
  return { usdc: fromBase(s.usdcBase), eth: s.eth };
}

export async function checkTransfer(i: { to: string; amountUsdc: string }): Promise<TransferCheck> {
  requireWallet();
  await sleep(300, 800);
  assertAddress(i.to);
  let amountBase: bigint;
  try {
    amountBase = BigInt(toBase(i.amountUsdc));
  } catch {
    return { outcome: "refused", reasons: ["INVALID_AMOUNT"] };
  }
  const s = tick();
  const d = policyDecision(s, "usdc_transfer", i.to, amountBase); // preview only: nothing is reserved
  return { outcome: d.outcome === "AUTO" ? "instant" : d.outcome === "LAWYER" ? "lawyer" : "refused", reasons: d.reasons };
}

export async function sendUsdc(i: { to: string; amountUsdc: string }, onUpdate: (t: TxView) => void): Promise<TxView> {
  requireWallet();
  assertAddress(i.to);
  return runTx("transfer", i.to, parseAmount(i.amountUsdc), null, false, onUpdate);
}

export async function getTx(requestId: string): Promise<TxView> {
  requireAuth();
  await sleep(300, 600);
  const s = tick();
  const tx = s.txs.find((t) => t.id === requestId);
  if (!tx) throw new SqKeysError("NOT_FOUND", "Request not found.");
  return txView(tx);
}

export async function cancelTx(requestId: string): Promise<void> {
  requireAuth();
  await sleep(300, 700);
  const s = tick();
  const tx = s.txs.find((t) => t.id === requestId);
  if (!tx) throw new SqKeysError("NOT_FOUND", "Request not found.");
  if (!CANCELLABLE.includes(tx.status)) throw new SqKeysError("CANNOT_CANCEL", "This request can no longer be cancelled.");
  finishTx(s, tx, "cancelled");
  save();
}

export async function getActivity(): Promise<ActivityItem[]> {
  requireAuth();
  await sleep(300, 800);
  const s = tick();
  return [...s.activity].sort((a, b) => b.at.localeCompare(a.at));
}

export async function getAlerts(): Promise<Alert[]> {
  requireAuth();
  await sleep(300, 600);
  return [...tick().alerts];
}

// ---------------------------------------------------------------- Swissquote and applications
export async function getSwissquoteAccount(): Promise<{ cashChf: string }> {
  requireAuth();
  await sleep(300, 700);
  const cents = BigInt(state().cashChfCents);
  return { cashChf: `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}` };
}

export async function transferFromSwissquote(amountUsdc: string): Promise<{ txHash: string; explorerUrl: string }> {
  requireWallet();
  const amountBase = parseAmount(amountUsdc);
  await sleep(900, 1500);
  const s = tick();
  if (amountBase <= 0n) throw new SqKeysError("INVALID_AMOUNT", "Enter a valid amount.");
  if (amountBase > SWISSQUOTE_PER_TRANSFER_BASE) throw new SqKeysError("LIMIT_EXCEEDED", "Limit: 10 USDC per transfer, 3 per day (demo).");
  s.deposits = s.deposits.filter((t) => t > Date.now() - DAY_MS);
  if (s.deposits.length >= SWISSQUOTE_PER_DAY) throw new SqKeysError("LIMIT_EXCEEDED", "Limit: 10 USDC per transfer, 3 per day (demo).");
  const chfCents = (amountBase * CHF_CENTS_PER_USDC) / 1_000_000n;
  if (chfCents > BigInt(s.cashChfCents)) throw new SqKeysError("INSUFFICIENT_CASH", "Your Swissquote balance is too low.");

  const txHash = newTxHash();
  s.cashChfCents = (BigInt(s.cashChfCents) - chfCents).toString();
  s.usdcBase = (BigInt(s.usdcBase) + amountBase).toString();
  s.deposits.push(Date.now());
  addActivity(s, {
    id: newId("dep"),
    kind: "transfer_in",
    title: "From Swissquote",
    amountUsdc: fromBase(amountBase.toString()),
    counterparty: "Swissquote",
    at: iso(Date.now()),
    status: "confirmed",
    txHash,
    explorerUrl: EXPLORER + txHash,
  });
  save();
  return { txHash, explorerUrl: EXPLORER + txHash };
}

function describeApp(spender: string, amountUsdc: string | "unlimited") {
  assertAddress(spender);
  const unlimited = amountUsdc === "unlimited";
  const amountBase = unlimited ? UNLIMITED_BASE : parseAmount(amountUsdc);
  const appName = KNOWN_APPS[spender.toLowerCase()] ?? null;
  return { appName, known: appName !== null, unlimited, amountBase };
}

export async function simulateApp(i: { spender: string; amountUsdc: string | "unlimited" }): Promise<{ appName: string | null; known: boolean; unlimited: boolean; plainText: string }> {
  requireWallet();
  await sleep(400, 900);
  const { appName, known, unlimited } = describeApp(i.spender, i.amountUsdc);
  const app = appName ?? shorten(i.spender);
  const main = unlimited ? `This lets ${app} spend any amount, at any time, until you cancel it.` : `This lets ${app} spend up to ${i.amountUsdc} USDC from your wallet.`;
  return { appName, known, unlimited, plainText: known ? main : `${main} We don't know this app. You decide, at your own risk.` };
}

export async function approveApp(i: { spender: string; amountUsdc: string | "unlimited" }, onUpdate: (t: TxView) => void): Promise<TxView> {
  requireWallet();
  const { appName, known, amountBase } = describeApp(i.spender, i.amountUsdc);
  return runTx("approve", i.spender, amountBase, appName, known, onUpdate);
}

// ---------------------------------------------------------------- Security
export async function createExitKit(passphrase: string): Promise<Blob> {
  const s = requireWallet();
  await sleep(800, 1400);
  if (passphrase.length < 10) throw new SqKeysError("WEAK_PASSPHRASE", "Use a passphrase of at least 10 characters.");
  s.exitKitCreatedAt = iso(Date.now());
  security(s, "Exit kit created");
  save();
  const kit = { format: "sqkeys-exit-kit-mock", simulated: true, note: "Simulated exit kit. It contains no key material.", address: s.address, createdAt: s.exitKitCreatedAt };
  return new Blob([JSON.stringify(kit, null, 2)], { type: "application/json" });
}

export async function revokeDevice(deviceId: string): Promise<void> {
  const s = requireAuth();
  await sleep(400, 900);
  const device = s.devices.find((d) => d.id === deviceId);
  if (!device) throw new SqKeysError("NOT_FOUND", "Device not found.");
  if (device.current) throw new SqKeysError("CANNOT_REVOKE_CURRENT", "You can't remove the phone you are using.");
  s.devices = s.devices.filter((d) => d.id !== deviceId);
  security(s, `Phone key removed: ${device.label}`);
  save();
}

// ---------------------------------------------------------------- Recovery (new phone)
export async function startRecovery(): Promise<{ recoveryId: string }> {
  const s = requireAuth();
  await sleep(600, 1100);
  if (!s.address) throw new SqKeysError("NO_WALLET", "There is no wallet to recover.");
  const existing = s.activeRecoveryId ? s.recoveries.find((r) => r.id === s.activeRecoveryId) : undefined;
  if (existing && !existing.cancelledBy && !existing.executed) return { recoveryId: existing.id };
  const r: RecoveryRecord = { id: newId("rec"), oldAddress: s.address, identityVerified: false, identityFailed: false, lawyerStatus: "pending", executed: false };
  s.recoveries.push(r);
  s.activeRecoveryId = r.id;
  s.status = "recovering";
  addAlert(s, "recovery_requested", "A recovery was requested for your wallet. If this wasn't you, cancel it now.");
  security(s, "Recovery requested");
  save();
  return { recoveryId: r.id };
}

export async function verifyIdentity(recoveryId: string, i: { bankingAnswer: string }): Promise<{ verified: boolean }> {
  const s = requireAuth();
  await sleep(1000, 1500);
  const r = findRecovery(s, recoveryId);
  if (r.cancelledBy || r.executed) throw new SqKeysError("RECOVERY_CLOSED", "This recovery is closed.");
  if (!i.bankingAnswer.trim()) throw new SqKeysError("INVALID_INPUT", "Answer the banking question.");
  if (!s.panel.identityPass) {
    r.identityFailed = true;
    addAlert(s, "identity_failed", "We could not verify your identity. Your lawyer was alerted.");
    save();
    return { verified: false };
  }
  const now = Date.now();
  r.identityFailed = false;
  r.identityVerified = true;
  r.identityVerifiedAt = now;
  r.releaseAfter = now + RECOVERY_DELAY_MS;
  security(s, "Identity verified");
  save();
  return { verified: true };
}

export async function createRecoveryWallet(recoveryId: string, onProgress: (s: WalletStep) => void): Promise<{ newAddress: string }> {
  const s = requireAuth();
  const r = findRecovery(s, recoveryId);
  if (!r.identityVerified) throw new SqKeysError("IDENTITY_NOT_VERIFIED", "Verify your identity first.");
  if (r.cancelledBy || r.executed) throw new SqKeysError("RECOVERY_CLOSED", "This recovery is closed.");
  if (r.newAddress) return { newAddress: r.newAddress };
  for (const step of WALLET_STEPS) {
    onProgress(step);
    if (step !== "done") await sleep(500, 1000);
  }
  r.newAddress = newAddress();
  save();
  return { newAddress: r.newAddress };
}

export async function getRecovery(recoveryId: string): Promise<RecoveryView> {
  requireAuth();
  await sleep(300, 600);
  const s = tick();
  const r = findRecovery(s, recoveryId);
  return {
    status: recoveryStatus(r),
    oldAddress: r.oldAddress,
    ...(r.newAddress ? { newAddress: r.newAddress } : {}),
    ...(r.releaseAfter !== undefined ? { releaseAfter: iso(r.releaseAfter) } : {}),
    lawyerStatus: r.lawyerStatus,
    identityVerified: r.identityVerified,
    ...(r.cancelledBy ? { cancelledBy: r.cancelledBy } : {}),
  };
}

export async function cancelRecovery(recoveryId: string): Promise<void> {
  const s = requireAuth();
  await sleep(400, 900);
  const r = findRecovery(s, recoveryId);
  if (r.executed) throw new SqKeysError("CANNOT_CANCEL", "This recovery is already complete.");
  if (r.cancelledBy) return;
  r.cancelledBy = "client";
  if (s.activeRecoveryId === r.id) {
    s.activeRecoveryId = null;
    s.status = "active";
  }
  for (const a of s.alerts) if (a.kind === "recovery_requested") a.read = true;
  security(s, "Recovery cancelled");
  save();
}

export async function executeRecovery(recoveryId: string): Promise<{ txHash: string; explorerUrl: string }> {
  const s = requireAuth();
  await sleep(1200, 1500);
  tick();
  const r = findRecovery(s, recoveryId);
  const status = recoveryStatus(r);
  if (status !== "ready") {
    const message = r.lawyerStatus === "pending" ? "Your lawyer has not approved yet." : r.releaseAfter !== undefined && Date.now() < r.releaseAfter ? "The waiting period is not over yet." : "This recovery cannot be completed.";
    throw new SqKeysError("RECOVERY_NOT_READY", message);
  }
  const txHash = newTxHash();
  r.executed = true;
  s.address = r.newAddress as string;
  s.activeRecoveryId = null;
  s.status = "active";
  s.devices = [{ id: newId("dev"), label: "This phone", createdAt: iso(Date.now()), current: true }]; // old phone keys are replaced
  for (const a of s.alerts) if (a.kind === "recovery_requested") a.read = true;
  addActivity(s, { id: newId("sec"), kind: "security", title: "Funds moved to your new wallet", at: iso(Date.now()), status: "confirmed", txHash, explorerUrl: EXPLORER + txHash });
  save();
  return { txHash, explorerUrl: EXPLORER + txHash };
}

// ================================================================ Dev panel API (/dev/mock only, not part of the contract)
export function getMockPanel(): MockPanel {
  return { ...state().panel };
}

export function setMockPanel(patch: Partial<MockPanel>): void {
  const s = state();
  s.panel = { ...s.panel, ...patch };
  save();
}

/** Back to a signed-out, empty account. The panel switches are kept. */
export function resetMockState(): void {
  current = initialState(state().panel);
  save();
}

/** Jump straight to a funded, active wallet (signed in). */
export function seedActiveWallet(): void {
  const s = initialState(state().panel);
  const now = Date.now();
  s.loggedIn = true;
  s.kycVerified = true;
  s.consents = (["terms", "risk", "recovery", "privacy"] as const).map((document) => ({ document, version: "1" }));
  s.status = "active";
  s.address = newAddress();
  s.devices = [{ id: newId("dev"), label: "This phone", createdAt: iso(now), current: true }];
  s.invite = { token: randomHex(16), clientName: DISPLAY_NAME, createdAt: now, expiresAt: now + INVITE_TTL_MS, accepted: true };
  s.usdcBase = "25000000";
  s.eth = "0.0010";
  security(s, "Wallet created");
  current = s;
  save();
}

/** Fast-forward every running timer by 120 s (recovery delay, auto lawyer, signing). Rolling limits are untouched. */
export function skipDelay(): void {
  const s = state();
  for (const tx of s.txs) {
    if (TERMINAL.includes(tx.status)) continue;
    tx.statusSince -= SKIP_MS;
  }
  for (const r of s.recoveries) {
    if (r.identityVerifiedAt !== undefined) r.identityVerifiedAt -= SKIP_MS;
    if (r.releaseAfter !== undefined) r.releaseAfter -= SKIP_MS;
  }
  if (s.invite && !s.invite.accepted) s.invite.createdAt -= SKIP_MS;
  tick();
}

export function resolveMockTx(requestId: string, decision: "approved" | "refused" | "expired"): void {
  const s = state();
  const tx = s.txs.find((t) => t.id === requestId);
  if (!tx || tx.status !== "pending_lawyer") return;
  if (decision === "approved") approveTx(s, tx);
  else finishTx(s, tx, decision === "refused" ? "refused" : "expired");
  tick();
}

export function resolveMockRecoveryLawyer(recoveryId: string, decision: "approved" | "refused"): void {
  const r = state().recoveries.find((x) => x.id === recoveryId);
  if (!r || r.cancelledBy || r.executed) return;
  r.lawyerStatus = decision;
  save();
}

export function acceptMockLawyerInvite(): void {
  acceptInvite(state());
  save();
}

export interface MockSnapshot {
  loggedIn: boolean;
  accountStatus: AccountStatus;
  address: string | null;
  usdc: string;
  invite: "none" | "invited" | "accepted";
  pendingTxs: { id: string; kind: "transfer" | "approve"; to: string; amountUsdc: string; reasons: Reason[] }[];
  recovery: { id: string; status: string; lawyerStatus: RecoveryView["lawyerStatus"]; identityVerified: boolean; releaseAfter: string | null } | null;
  panel: MockPanel;
}

/** Advances the timers and returns what the panel displays. */
export function getMockSnapshot(): MockSnapshot {
  const s = tick();
  const r = s.activeRecoveryId ? s.recoveries.find((x) => x.id === s.activeRecoveryId) : undefined;
  return {
    loggedIn: s.loggedIn,
    accountStatus: s.status,
    address: s.address,
    usdc: fromBase(s.usdcBase),
    invite: lawyerStatus(s),
    pendingTxs: s.txs
      .filter((t) => t.status === "pending_lawyer")
      .map((t) => ({ id: t.id, kind: t.kind, to: t.to, amountUsdc: BigInt(t.amountBase) >= UNLIMITED_BASE ? "unlimited" : fromBase(t.amountBase), reasons: t.reasons })),
    recovery: r ? { id: r.id, status: recoveryStatus(r), lawyerStatus: r.lawyerStatus, identityVerified: r.identityVerified, releaseAfter: r.releaseAfter !== undefined ? iso(r.releaseAfter) : null } : null,
    panel: { ...s.panel },
  };
}
