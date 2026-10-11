// Live mode of the client app, server side: everything lib/sqkeys.ts needs that cannot run in a browser (secrets, Supabase, calls to the
// lawyer node and to Swissquote). Custody model: Safe 2-of-3 smart account (not MPC). P1 never reaches this server: the browser signs and
// only sends signatures. Each handler is `(ctx, accountId, input) => result`; the route table is at the bottom.
import { createHmac, randomUUID, createHash } from "node:crypto";
import { getAddress, isAddress, recoverAddress, type Address, type Hex } from "viem";
import { fromBase, toBase } from "@/lib/amounts";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legalVersion";
import { packSignatures, SAFE_THRESHOLD, safeTxHash, saltNonceFor, swapOwnerTx, usdcTransferTx } from "@/lib/shared/safe";
import { inviteUrl } from "@/lib/urls";
import { SqKeysError, type Account, type ActivityItem, type Alert, type Device, type RecoveryView, type TransferCheck, type TxStatus, type TxView } from "@/lib/sqkeys.types";
import type { Ctx } from "./ctx";
import { DbError, type Row } from "./db";
import { ApiError } from "./errors";

// ---------------------------------------------------------------- small helpers
const invalid = (message: string) => new ApiError(400, "INVALID_INPUT", message);
type Input = Record<string, unknown>;
const iso = (v: string | number | Date) => new Date(v).toISOString();
const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

function text(input: Input, key: string, max = 200): string {
  const v = input[key];
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw invalid(`Field ${key} is missing or invalid.`);
  return v;
}
function addr(input: Input, key: string): Address {
  const v = text(input, key, 42);
  if (!isAddress(v, { strict: false })) throw invalid(`Field ${key} is not a valid address.`);
  return getAddress(v);
}
function uuid(input: Input, key: string): string {
  const v = text(input, key, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw invalid(`Field ${key} is not a valid id.`);
  return v.toLowerCase();
}
function amountBase(input: Input, key = "amountUsdc"): bigint {
  try {
    const base = BigInt(toBase(text(input, key, 30)));
    return base;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "INVALID_AMOUNT", "Enter an amount in USDC with at most 6 decimals.");
  }
}
const explorerTx = (ctx: Ctx, hash: string) => `${ctx.config.explorerUrl}/tx/${hash}`;

async function account(ctx: Ctx, id: string): Promise<Row> {
  const a = (await ctx.db.select("accounts", { id }))[0];
  if (!a) throw new ApiError(401, "NOT_AUTHENTICATED", "Sign in to continue.");
  return a;
}
function wallet(a: Row): Address {
  if (!a.wallet_address) throw new ApiError(409, "NO_WALLET", "Your wallet is not created yet.");
  return getAddress(a.wallet_address);
}
const touch = (ctx: Ctx, id: string, patch: Row) => ctx.db.update("accounts", { id }, { ...patch, updated_at: ctx.now.toISOString() });

// ---------------------------------------------------------------- onboarding
/** Result with a session cookie to set. */
export type WithSession<T> = { __session: string; body: T };

export async function login(ctx: Ctx, input: Input): Promise<WithSession<{ displayName: string; kycStatus: string; accountStatus: Account["status"] }>> {
  const res = await ctx.sq.post<{ sqRef: string; displayName: string; kycStatus: string }>("/api/login", { clientId: text(input, "clientId"), password: text(input, "password") });
  let acc = (await ctx.db.select("accounts", { sq_ref: res.sqRef }))[0];
  if (!acc) {
    try {
      acc = await ctx.db.insert("accounts", { sq_ref: res.sqRef, status: "created", display_name: res.displayName, lawyer_status: "none", created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString() });
    } catch (e) {
      if (!(e instanceof DbError && e.kind === "UNIQUE")) throw e;
      acc = (await ctx.db.select("accounts", { sq_ref: res.sqRef }))[0];
    }
  }
  return { __session: acc.id, body: { displayName: res.displayName, kycStatus: res.kycStatus === "verified" ? "verified" : "not_started", accountStatus: acc.status } };
}

export async function kyc(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  await ctx.sq.post("/api/kyc", { sqRef: a.sq_ref });
  return { ok: true };
}

const DOCS = ["terms", "risk", "recovery", "privacy"] as const;
export async function register(ctx: Ctx, id: string, input: Input) {
  await account(ctx, id);
  const list = Array.isArray(input.consents) ? (input.consents as Input[]) : [];
  const missing = DOCS.filter((d) => !list.some((c) => c.document === d));
  if (missing.length) throw new ApiError(400, "CONSENTS_REQUIRED", "Accept the Terms of use, Risk warning, Recovery terms and Privacy policy to continue.");
  const acceptedAt = ctx.now.toISOString();
  for (const c of list) {
    if (!DOCS.includes(c.document as (typeof DOCS)[number]) || typeof c.version !== "string") throw invalid("A consent is invalid.");
    await ctx.db.insert("consents", { account_id: id, document: c.document, version: c.version.slice(0, 40), accepted_at: acceptedAt });
  }
  return { ok: true };
}

/** The invitation token is derived, not stored: the link can be shown again after a reload and only its hash is kept. */
const inviteToken = (ctx: Ctx, invitationId: string) => {
  const secret = ctx.env.SESSION_SECRET;
  if (!secret) throw new ApiError(500, "NOT_CONFIGURED", "Sessions are not configured.");
  return createHmac("sha256", secret).update(`sqkeys-invite|${invitationId}`).digest("base64url");
};

export async function invite(ctx: Ctx, id: string, input: Input) {
  const a = await account(ctx, id);
  if (a.lawyer_status === "accepted") throw new ApiError(409, "ALREADY_ACCEPTED", "Your lawyer already accepted.");
  const clientName = text(input, "clientDisplayName", 80);
  const live = (await ctx.db.select("invitations", { account_id: id, status: "pending", expires_at: { gt: ctx.now.toISOString() } }, { order: ["created_at", "desc"], limit: 1 }))[0];
  let row = live;
  if (!row) {
    const invitationId = randomUUID();
    const token = inviteToken(ctx, invitationId);
    const expiresAt = iso(ctx.now.getTime() + ctx.config.inviteTtlSeconds * 1000);
    row = await ctx.db.insert("invitations", { id: invitationId, account_id: id, token_hash: sha256Hex(token), status: "pending", expires_at: expiresAt, created_at: ctx.now.toISOString() });
    try {
      await ctx.lawyer.post("/api/invite/register", { sqRef: a.sq_ref, tokenHash: sha256Hex(token), displayName: clientName });
    } catch (e) {
      await ctx.db.delete("invitations", { id: invitationId });
      throw e;
    }
    for (const old of await ctx.db.select("invitations", { account_id: id, status: "pending" })) if (old.id !== invitationId) await ctx.db.update("invitations", { id: old.id }, { status: "revoked" });
  }
  // A missing NEXT_PUBLIC_LAWYER_URL in production throws LAWYER_URL_NOT_CONFIGURED: no localhost link is ever produced.
  let url: string;
  try {
    url = inviteUrl(inviteToken(ctx, row.id), ctx.config.lawyerPortalUrl, ctx.env.NODE_ENV);
  } catch (e) {
    if (e instanceof SqKeysError) throw new ApiError(503, e.code, e.message);
    throw e;
  }
  if (a.status === "created") await touch(ctx, id, { status: "awaiting_lawyer", lawyer_status: "invited" });
  return { inviteUrl: url, expiresAt: iso(row.expires_at) };
}

export async function lawyerStatus(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  if (a.lawyer_status === "accepted") return { status: "accepted" as const, displayName: a.lawyer_name ?? "Your lawyer" };
  const live = (await ctx.db.select("invitations", { account_id: id, status: "pending" }, { order: ["created_at", "desc"], limit: 1 }))[0];
  if (a.lawyer_status !== "invited" || !live) return { status: "none" as const };
  const res = await ctx.lawyer.get<{ status: string; lawyerName?: string }>("/api/invite/status", { sqRef: a.sq_ref });
  if (res.status === "accepted") {
    await markAccepted(ctx, a, res.lawyerName ?? "Your lawyer");
    return { status: "accepted" as const, displayName: res.lawyerName ?? "Your lawyer" };
  }
  return { status: "invited" as const, expiresAt: iso(live.expires_at) };
}

async function markAccepted(ctx: Ctx, a: Row, lawyerName: string) {
  await touch(ctx, a.id, { lawyer_status: "accepted", lawyer_name: lawyerName, lawyer_accepted_at: ctx.now.toISOString(), ...(["created", "awaiting_lawyer"].includes(a.status) ? { status: "ready_for_keys" } : {}) });
  await ctx.db.update("invitations", { account_id: a.id, status: "pending" }, { status: "accepted" });
}

/** POST /api/internal/lawyer-accepted (HMAC, from the lawyer node). */
export async function lawyerAccepted(ctx: Ctx, input: Input) {
  const a = (await ctx.db.select("accounts", { sq_ref: text(input, "sqRef") }))[0];
  if (!a) throw new ApiError(404, "UNKNOWN_ACCOUNT", "Unknown account.");
  if (a.lawyer_status !== "accepted") await markAccepted(ctx, a, typeof input.lawyerName === "string" ? input.lawyerName.slice(0, 80) : "Your lawyer");
  return { ok: true };
}

// ---------------------------------------------------------------- the phone key (P1 stays in the browser)
// ownerAddress is public; the browser compares it with the key it holds to mark the current phone.
const deviceView = (d: Row): Device & { ownerAddress: string } => ({ id: d.id, label: d.label, createdAt: iso(d.created_at), current: false, ownerAddress: d.owner_address });

export async function deviceRegister(ctx: Ctx, id: string, input: Input): Promise<Device> {
  const a = await account(ctx, id);
  if (a.lawyer_status !== "accepted") throw new ApiError(409, "LAWYER_NOT_ACCEPTED", "Your lawyer has not accepted yet.");
  if (a.wallet_address) throw new ApiError(409, "WALLET_EXISTS", "Your wallet already exists.");
  const label = text(input, "label", 60).trim();
  if (!label) throw new ApiError(400, "INVALID_LABEL", "Give this phone a name.");
  const owner = addr(input, "ownerAddress");
  const credentialId = text(input, "credentialId", 400);
  // Before the wallet exists a retry replaces the previous attempt: only the last key becomes the owner.
  for (const old of await ctx.db.select("devices", { account_id: id, revoked_at: null })) await ctx.db.update("devices", { id: old.id }, { revoked_at: ctx.now.toISOString() });
  let row: Row;
  try {
    row = await ctx.db.insert("devices", { account_id: id, credential_id: credentialId, label, prf_supported: input.prfSupported !== false, owner_address: owner.toLowerCase(), created_at: ctx.now.toISOString() });
  } catch (e) {
    if (e instanceof DbError && e.kind === "UNIQUE") {
      // Same passkey registered again (page reloaded): reuse it.
      row = (await ctx.db.update("devices", { credential_id: credentialId, account_id: id }, { revoked_at: null, owner_address: owner.toLowerCase(), label }))[0];
      if (!row) throw new ApiError(409, "PASSKEY_EXISTS", "This passkey already belongs to another account.");
    } else throw e;
  }
  await touch(ctx, id, { p1_address: owner.toLowerCase() });
  return { ...deviceView(row), current: true };
}

export async function walletOwners(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  if (!a.p1_address) throw new ApiError(409, "NO_KEY", "Create your key on this phone first.");
  if (a.lawyer_status !== "accepted") throw new ApiError(409, "LAWYER_NOT_ACCEPTED", "Your lawyer has not accepted yet.");
  const p2 = (await ctx.lawyer.post<{ address: string }>("/api/node/owner/create", { sqRef: a.sq_ref })).address;
  const p3 = (await ctx.sq.post<{ address: string }>("/api/node/owner/create", { sqRef: a.sq_ref })).address;
  if (!a.wallet_address) await touch(ctx, id, { p2_address: p2.toLowerCase(), p3_address: p3.toLowerCase(), status: "creating_wallet" });
  return { p1: getAddress(a.p1_address), p2: getAddress(p2), p3: getAddress(p3) };
}

export async function walletDeploy(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  if (a.wallet_address) return { address: getAddress(a.wallet_address), deployTxHash: a.deploy_tx_hash ?? null, explorerUrl: a.deploy_tx_hash ? explorerTx(ctx, a.deploy_tx_hash) : null };
  if (!a.p1_address || !a.p2_address || !a.p3_address) throw new ApiError(409, "OWNERS_MISSING", "The three keys are not ready yet.");
  const salt = saltNonceFor(a.sq_ref).toString();
  const res = await ctx.sq.post<{ address: string; txHash: string | null }>("/api/gas/deploy", {
    sqRef: a.sq_ref, owners: [getAddress(a.p1_address), getAddress(a.p2_address), getAddress(a.p3_address)], threshold: SAFE_THRESHOLD, saltNonce: salt,
  });
  const safe = getAddress(res.address);
  await ctx.lawyer.post("/api/node/wallet/register", { sqRef: a.sq_ref, safeAddress: safe });
  await touch(ctx, id, { wallet_address: safe.toLowerCase(), public_key: safe.toLowerCase(), salt_nonce: salt, deploy_tx_hash: res.txHash, deployed_at: ctx.now.toISOString(), status: "active" });
  return { address: safe, deployTxHash: res.txHash, explorerUrl: res.txHash ? explorerTx(ctx, res.txHash) : null };
}

// ---------------------------------------------------------------- account, balance
export async function accountView(ctx: Ctx, id: string): Promise<Account> {
  const a = await account(ctx, id);
  const devices = (await ctx.db.select("devices", { account_id: id, revoked_at: null }, { order: ["created_at", "asc"] })).map(deviceView);
  const consents = (await ctx.db.select("consents", { account_id: id }, { order: ["id", "asc"] })).map((c) => ({ document: c.document, version: c.version, acceptedAt: iso(c.accepted_at) }));
  const open = (await ctx.db.select("recoveries", { account_id: id }, { order: ["created_at", "desc"] })).find((r) => !["completed", "cancelled", "failed"].includes(r.status));
  let policy: Account["policy"];
  if (a.wallet_address && a.lawyer_status === "accepted") {
    policy = await ctx.lawyer.get("/api/node/policy", { sqRef: a.sq_ref }).catch(() => undefined);
  }
  return {
    status: a.status, address: a.wallet_address ? getAddress(a.wallet_address) : null,
    lawyer: { status: a.lawyer_status, ...(a.lawyer_status === "accepted" ? { displayName: a.lawyer_name ?? "Your lawyer" } : {}) },
    devices, exitKitCreatedAt: a.exit_kit_created_at ? iso(a.exit_kit_created_at) : null,
    recovery: open ? { id: open.id, status: recoveryLabel(open) } : null,
    ...(policy ? { policy } : {}), consents,
  };
}

export async function balance(ctx: Ctx, id: string) {
  const safe = wallet(await account(ctx, id));
  const [usdc, eth] = await Promise.all([ctx.chain.usdcBalance(safe), ctx.chain.ethBalance(safe)]);
  return { usdc: fromBase(usdc.toString()), eth: (Number(eth) / 1e18).toFixed(4) };
}

// ---------------------------------------------------------------- Swissquote
export async function swissquoteAccount(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  const res = await ctx.sq.get<{ cashChf: number }>("/api/bank-account", { sqRef: a.sq_ref });
  return { cashChf: Number(res.cashChf).toFixed(2) };
}

export async function swissquoteTransfer(ctx: Ctx, id: string, input: Input) {
  const a = await account(ctx, id);
  const safe = wallet(a);
  const amount = amountBase(input);
  const res = await ctx.sq.post<{ txHash: string }>("/api/bank/transfer", { sqRef: a.sq_ref, to: safe, amountUsdc: amount.toString() });
  await ctx.db.insert("tx_requests", {
    account_id: id, kind: "usdc_transfer", direction: "in", to_address: safe.toLowerCase(), amount_base: amount.toString(), status: "confirmed", outcome: "AUTO",
    reasons: [], tx_hash: res.txHash, created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
  });
  return { txHash: res.txHash, explorerUrl: explorerTx(ctx, res.txHash) };
}

// ---------------------------------------------------------------- sending USDC
const OUTCOME = { AUTO: "AUTO", LAWYER: "LAWYER", REFUSED: "REFUSED" } as const;
const txView = (ctx: Ctx, r: Row): TxView => ({
  requestId: r.id, status: r.status as TxStatus, outcome: (r.outcome ?? "AUTO") as TxView["outcome"], reasons: (r.reasons ?? []) as TxView["reasons"],
  ...(r.approval_expires_at ? { approvalExpiresAt: iso(r.approval_expires_at) } : {}),
  ...(r.tx_hash ? { txHash: r.tx_hash, explorerUrl: explorerTx(ctx, r.tx_hash) } : {}),
});

export async function transferCheck(ctx: Ctx, id: string, input: Input): Promise<TransferCheck> {
  const a = await account(ctx, id);
  const safe = wallet(a);
  const to = addr(input, "to");
  const res = await ctx.lawyer.post<{ outcome: keyof typeof OUTCOME; reasons: TransferCheck["reasons"] }>("/api/node/transfer/check", { sqRef: a.sq_ref, safeAddress: safe, to, amount: amountBase(input).toString() });
  return { outcome: res.outcome === "AUTO" ? "instant" : res.outcome === "LAWYER" ? "lawyer" : "refused", reasons: res.reasons };
}

/** Step 1: the facts the browser needs to sign. The browser rebuilds the hash itself and compares. */
export async function transferPrepare(ctx: Ctx, id: string, input: Input) {
  const a = await account(ctx, id);
  const safe = wallet(a);
  const to = addr(input, "to");
  const amount = amountBase(input);
  if (amount <= 0n) throw new ApiError(400, "INVALID_AMOUNT", "Enter an amount above zero.");
  const busy = (await ctx.db.select("tx_requests", { account_id: id, direction: "out" })).find((r) => ["pending_lawyer", "signing"].includes(r.status));
  if (busy) throw new ApiError(409, "TRANSFER_IN_PROGRESS", "Finish or cancel your pending transfer first.");
  const state = await ctx.chain.getSafeState(safe);
  const tx = usdcTransferTx(ctx.config.usdc, to, amount);
  const hash = safeTxHash({ safe, tx, nonce: state.nonce });
  const row = await ctx.db.insert("tx_requests", {
    account_id: id, kind: "usdc_transfer", direction: "out", to_address: to.toLowerCase(), amount_base: amount.toString(), status: "evaluating", reasons: [],
    intent_hash: hash, safe_tx_hash: hash, safe_nonce: state.nonce.toString(), created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
  });
  return { requestId: row.id, safeAddress: safe, to, amountBase: amount.toString(), nonce: state.nonce.toString(), safeTxHash: hash, usdc: ctx.config.usdc, chainId: ctx.config.chainId };
}

async function setTx(ctx: Ctx, rowId: string, patch: Row) {
  return ctx.db.update("tx_requests", { id: rowId }, { ...patch, updated_at: ctx.now.toISOString() });
}

/** Sponsored execution with P1 + P2. Exactly one caller wins the move to "signing". */
async function execute(ctx: Ctx, a: Row, r: Row, p2Signature: Hex): Promise<Row> {
  const won = await ctx.db.update("tx_requests", { id: r.id, status: { in: ["evaluating", "pending_lawyer"] } }, { status: "signing", updated_at: ctx.now.toISOString() });
  if (won.length !== 1) return (await ctx.db.select("tx_requests", { id: r.id }))[0];
  const safe = getAddress(a.wallet_address);
  const tx = usdcTransferTx(ctx.config.usdc, getAddress(r.to_address), BigInt(r.amount_base));
  try {
    const signatures = packSignatures([
      { signer: getAddress(r.p1_signer), signature: r.p1_signature as Hex },
      { signer: getAddress(a.p2_address), signature: p2Signature },
    ]);
    const res = await ctx.sq.post<{ txHash: string }>("/api/gas/exec", { safeAddress: safe, safeTx: { to: tx.to, value: "0", data: tx.data }, signatures });
    return (await setTx(ctx, r.id, { status: "confirmed", tx_hash: res.txHash, p1_signature: null }))[0];
  } catch (e) {
    await setTx(ctx, r.id, { status: "failed", p1_signature: null });
    throw e;
  }
}

/** Step 2: the browser's P1 signature over the hash. The lawyer node decides; AUTO runs at once, LAWYER waits. */
export async function transferSubmit(ctx: Ctx, id: string, input: Input): Promise<TxView> {
  const a = await account(ctx, id);
  const safe = wallet(a);
  const r = (await ctx.db.select("tx_requests", { id: uuid(input, "requestId"), account_id: id, direction: "out" }))[0];
  if (!r) throw new ApiError(404, "NOT_FOUND", "Transfer not found.");
  if (r.status !== "evaluating") return txView(ctx, r);
  const signature = text(input, "p1Signature", 140) as Hex;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw invalid("Field p1Signature is not a 65 byte signature.");

  const state = await ctx.chain.getSafeState(safe);
  if (state.nonce.toString() !== String(r.safe_nonce)) {
    await setTx(ctx, r.id, { status: "failed" });
    throw new ApiError(409, "STALE", "Your wallet changed since you started. Nothing was sent. Start again.");
  }
  // The signature must come from the key that really owns the wallet now: an old phone is refused here.
  const signer = await recoverAddress({ hash: r.safe_tx_hash, signature }).catch(() => null);
  if (!signer || signer.toLowerCase() !== state.owners[0].toLowerCase()) throw new ApiError(403, "WRONG_PHONE", "This phone does not control the wallet any more.");

  const out = await ctx.lawyer.post<{ status: "signed" | "pending" | "refused"; outcome: keyof typeof OUTCOME; reasons: string[]; signature?: Hex; requestId?: string; expiresAt?: string }>("/api/node/transfer/request", {
    sqRef: a.sq_ref, safeAddress: safe, to: getAddress(r.to_address), amount: String(r.amount_base), nonce: String(r.safe_nonce), safeTxHash: r.safe_tx_hash,
  });
  const base = { p1_signature: signature, p1_signer: signer.toLowerCase(), outcome: out.outcome, reasons: out.reasons };
  if (out.status === "refused") return txView(ctx, (await setTx(ctx, r.id, { ...base, status: "refused", p1_signature: null }))[0]);
  if (out.status === "pending") {
    return txView(ctx, (await setTx(ctx, r.id, { ...base, status: "pending_lawyer", lawyer_request_id: out.requestId, approval_expires_at: out.expiresAt }))[0]);
  }
  const saved = (await setTx(ctx, r.id, base))[0];
  return txView(ctx, await execute(ctx, a, saved, out.signature as Hex));
}

export async function transferStatus(ctx: Ctx, id: string, input: Input): Promise<TxView> {
  const a = await account(ctx, id);
  let r = (await ctx.db.select("tx_requests", { id: uuid(input, "requestId"), account_id: id }))[0];
  if (!r) throw new ApiError(404, "NOT_FOUND", "Transfer not found.");
  if (r.status === "pending_lawyer") {
    const res = await ctx.lawyer.get<{ status: string; signature?: Hex }>("/api/node/transfer/status", { sqRef: a.sq_ref, requestId: r.lawyer_request_id });
    if (res.status === "approved" && res.signature) r = await execute(ctx, a, r, res.signature);
    else if (res.status === "refused") r = (await setTx(ctx, r.id, { status: "refused", outcome: "REFUSED", p1_signature: null }))[0];
    else if (res.status === "expired") r = (await setTx(ctx, r.id, { status: "expired", p1_signature: null }))[0];
  }
  return txView(ctx, r);
}

export async function transferCancel(ctx: Ctx, id: string, input: Input) {
  const r = (await ctx.db.select("tx_requests", { id: uuid(input, "requestId"), account_id: id }))[0];
  if (!r) throw new ApiError(404, "NOT_FOUND", "Transfer not found.");
  const done = await ctx.db.update("tx_requests", { id: r.id, status: { in: ["evaluating", "pending_lawyer"] } }, { status: "cancelled", p1_signature: null, updated_at: ctx.now.toISOString() });
  if (!done.length && !["cancelled"].includes(r.status)) throw new ApiError(409, "CANNOT_CANCEL", "This transfer can no longer be cancelled.");
  return { ok: true };
}

export async function activity(ctx: Ctx, id: string): Promise<ActivityItem[]> {
  const a = await account(ctx, id);
  const items: ActivityItem[] = (await ctx.db.select("tx_requests", { account_id: id }, { order: ["created_at", "desc"] }))
    .filter((r) => r.status !== "evaluating")
    .map((r) => ({
      id: r.id, kind: r.direction === "in" ? ("transfer_in" as const) : ("transfer_out" as const),
      title: r.direction === "in" ? "From Swissquote" : "Sent USDC", amountUsdc: fromBase(String(r.amount_base)), counterparty: r.direction === "in" ? "Swissquote" : getAddress(r.to_address),
      at: iso(r.created_at), status: r.status as TxStatus, ...(r.tx_hash ? { txHash: r.tx_hash, explorerUrl: explorerTx(ctx, r.tx_hash) } : {}),
    }));
  if (a.deployed_at) items.push({ id: `deploy-${a.id}`, kind: "security", title: "Wallet created", at: iso(a.deployed_at), status: "confirmed", ...(a.deploy_tx_hash ? { txHash: a.deploy_tx_hash, explorerUrl: explorerTx(ctx, a.deploy_tx_hash) } : {}) });
  for (const rec of await ctx.db.select("recoveries", { account_id: id, status: "completed" })) {
    items.push({ id: `rec-${rec.id}`, kind: "security", title: "Phone key replaced", at: iso(rec.completed_at ?? rec.created_at), status: "confirmed", ...(rec.swap_tx_hash ? { txHash: rec.swap_tx_hash, explorerUrl: explorerTx(ctx, rec.swap_tx_hash) } : {}) });
  }
  return items.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

export async function alerts(ctx: Ctx, id: string): Promise<Alert[]> {
  await account(ctx, id);
  return (await ctx.db.select("alerts", { account_id: id }, { order: ["created_at", "desc"] })).map((r) => ({ id: r.id, kind: r.kind, message: r.message, createdAt: iso(r.created_at), read: Boolean(r.read_at) }));
}
const addAlert = (ctx: Ctx, id: string, kind: string, message: string) => ctx.db.insert("alerts", { account_id: id, kind, message, created_at: ctx.now.toISOString() });

// ---------------------------------------------------------------- exit kit
export async function exitKitInfo(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  const safe = wallet(a);
  return { safeAddress: safe, p2Address: getAddress(a.p2_address), p3Address: getAddress(a.p3_address), chainId: ctx.config.chainId, usdc: ctx.config.usdc, explorerUrl: ctx.config.explorerUrl };
}
export async function exitKitRecord(ctx: Ctx, id: string) {
  await account(ctx, id);
  await touch(ctx, id, { exit_kit_created_at: ctx.now.toISOString() });
  return { ok: true };
}

// ---------------------------------------------------------------- recovery (new phone)
/** identity_pending | identity_failed | identity_verified | waiting | ready | refused | cancelled | completed */
function recoveryLabel(r: Row): string {
  if (r.cancelled_by) return "cancelled";
  if (r.status === "completed") return "completed";
  if (r.status === "failed") return "identity_failed";
  if (r.lawyer_status === "refused") return "refused";
  if (r.status === "identity_pending") return "identity_pending";
  if (!r.new_owner_address) return "identity_verified";
  return "waiting";
}

async function recoveryRow(ctx: Ctx, id: string, recoveryId: string): Promise<Row> {
  const r = (await ctx.db.select("recoveries", { id: recoveryId, account_id: id }))[0];
  if (!r) throw new ApiError(404, "NOT_FOUND", "Recovery not found.");
  return r;
}

export async function recoveryStart(ctx: Ctx, id: string) {
  const a = await account(ctx, id);
  const safe = wallet(a);
  const existing = (await ctx.db.select("recoveries", { account_id: id }, { order: ["created_at", "desc"] })).find((r) => !["completed", "cancelled", "failed"].includes(r.status));
  if (existing) return { recoveryId: existing.id };
  const recoveryId = randomUUID();
  await ctx.sq.post("/api/recovery/open", { sqRef: a.sq_ref, recoveryId, safeAddress: safe });
  await ctx.db.insert("recoveries", { id: recoveryId, account_id: id, status: "identity_pending", old_address: safe.toLowerCase(), sq_recovery_id: recoveryId, lawyer_status: "pending", created_at: ctx.now.toISOString() });
  await touch(ctx, id, { status: "recovering" });
  await addAlert(ctx, id, "recovery_requested", "A recovery was requested for your wallet. If this wasn't you, cancel it now.");
  return { recoveryId };
}

export async function recoveryVerify(ctx: Ctx, id: string, input: Input) {
  const a = await account(ctx, id);
  const r = await recoveryRow(ctx, id, uuid(input, "recoveryId"));
  if (r.cancelled_by || r.status === "completed") throw new ApiError(409, "RECOVERY_CLOSED", "This recovery is closed.");
  const answer = text(input, "bankingAnswer", 200);
  const res = await ctx.sq.post<{ verified: boolean; releaseAfter: string | null }>("/api/recovery/identity/verify", { recoveryId: r.id, selfie: "simulated", bankingAnswer: answer });
  if (!res.verified) {
    await ctx.db.update("recoveries", { id: r.id }, { status: "failed" });
    await addAlert(ctx, id, "identity_failed", "We could not verify your identity. Your lawyer was alerted.");
    await touch(ctx, id, { status: "active" });
    return { verified: false };
  }
  await ctx.db.update("recoveries", { id: r.id }, { status: "identity_verified", identity_verified_at: ctx.now.toISOString(), release_after: res.releaseAfter });
  void a;
  return { verified: true };
}

/** The new phone's key (P1') is attached once the identity check passed; the lawyer is then asked to approve. */
export async function recoveryAttach(ctx: Ctx, id: string, input: Input) {
  const a = await account(ctx, id);
  const r = await recoveryRow(ctx, id, uuid(input, "recoveryId"));
  if (r.cancelled_by || r.status === "completed") throw new ApiError(409, "RECOVERY_CLOSED", "This recovery is closed.");
  if (!["identity_verified", "awaiting_approval_and_delay"].includes(r.status)) throw new ApiError(409, "IDENTITY_NOT_VERIFIED", "Verify your identity first.");
  const owner = addr(input, "ownerAddress");
  if (r.new_owner_address && r.new_owner_address !== owner.toLowerCase()) throw new ApiError(409, "NEW_OWNER_SET", "The new key of this recovery is already set.");
  await ctx.sq.post("/api/recovery/attach", { recoveryId: r.id, newOwnerAddress: owner });
  await ctx.lawyer.post("/api/node/recovery/request", { sqRef: a.sq_ref, recoveryId: r.id, safeAddress: getAddress(a.wallet_address), newOwnerAddress: owner });
  await ctx.db.update("recoveries", { id: r.id }, { status: "awaiting_approval_and_delay", new_owner_address: owner.toLowerCase(), new_credential_id: text(input, "credentialId", 400) });
  return { newAddress: getAddress(a.wallet_address) };
}

export async function recoveryView(ctx: Ctx, id: string, input: Input): Promise<RecoveryView> {
  const a = await account(ctx, id);
  let r = await recoveryRow(ctx, id, uuid(input, "recoveryId"));
  const safe = getAddress(a.wallet_address);
  const base = { oldAddress: safe, newAddress: safe } as const;
  if (r.status === "completed") return { status: "completed", ...base, lawyerStatus: "approved", identityVerified: true };
  const sq = await ctx.sq.get<{ identityVerified: boolean; identityFailed: boolean; releaseAfter: string | null; cancelled: boolean; delayElapsed?: boolean }>("/api/recovery/status", { recoveryId: r.id });
  if (sq.cancelled && !r.cancelled_by) {
    r = (await ctx.db.update("recoveries", { id: r.id }, { cancelled_by: "system", status: "cancelled" }))[0];
  }
  let lawyerStatus: RecoveryView["lawyerStatus"] = r.lawyer_status ?? "pending";
  if (r.new_owner_address && !r.cancelled_by) {
    const l = await ctx.lawyer.get<{ status: string }>("/api/node/recovery/status", { sqRef: a.sq_ref, recoveryId: r.id });
    lawyerStatus = l.status === "approved" || l.status === "done" ? "approved" : l.status === "refused" || l.status === "expired" ? "refused" : "pending";
    if (lawyerStatus !== r.lawyer_status) r = (await ctx.db.update("recoveries", { id: r.id }, { lawyer_status: lawyerStatus }))[0];
  }
  let status = recoveryLabel(r);
  if (sq.identityFailed) status = "identity_failed";
  else if (!sq.identityVerified && status !== "cancelled") status = "identity_pending";
  else if (status === "waiting") status = lawyerStatus === "approved" && sq.delayElapsed ? "ready" : "waiting";
  if (status === "refused" && !r.cancelled_by) await touch(ctx, id, { status: "active" }); // refused: the old phone keeps control
  return {
    status, ...base, lawyerStatus, identityVerified: sq.identityVerified,
    ...(sq.releaseAfter ? { releaseAfter: iso(sq.releaseAfter) } : {}), ...(r.cancelled_by ? { cancelledBy: r.cancelled_by } : {}),
  };
}

export async function recoveryCancel(ctx: Ctx, id: string, input: Input) {
  await account(ctx, id);
  const r = await recoveryRow(ctx, id, uuid(input, "recoveryId"));
  if (r.status === "completed") throw new ApiError(409, "CANNOT_CANCEL", "This recovery is already complete.");
  if (r.cancelled_by) return { ok: true };
  await ctx.sq.post("/api/recovery/cancel", { recoveryId: r.id });
  await ctx.db.update("recoveries", { id: r.id }, { cancelled_by: "client", status: "cancelled" });
  await touch(ctx, id, { status: "active" });
  await ctx.db.update("alerts", { account_id: id, kind: "recovery_requested" }, { read_at: ctx.now.toISOString() });
  return { ok: true };
}

/** P2 + P3 sign the swapOwner this server rebuilt; the sponsor submits it. Same wallet address afterwards. */
export async function recoveryExecute(ctx: Ctx, id: string, input: Input) {
  const a = await account(ctx, id);
  const r = await recoveryRow(ctx, id, uuid(input, "recoveryId"));
  const view = await recoveryView(ctx, id, { recoveryId: r.id });
  if (view.status !== "ready") {
    const message = view.lawyerStatus === "pending" ? "Your lawyer has not approved yet." : view.lawyerStatus === "refused" ? "Your lawyer refused this recovery." : "The waiting period is not over yet.";
    throw new ApiError(409, "RECOVERY_NOT_READY", message);
  }
  const claimed = await ctx.db.update("recoveries", { id: r.id, status: "awaiting_approval_and_delay" }, { status: "executing" });
  if (claimed.length !== 1) throw new ApiError(409, "RECOVERY_NOT_READY", "This recovery is already being completed.");
  try {
    const safe = getAddress(a.wallet_address);
    const newOwner = getAddress(r.new_owner_address);
    const state = await ctx.chain.getSafeState(safe);
    const tx = swapOwnerTx({ safe, owners: state.owners, oldOwner: state.owners[0], newOwner });
    const hash = safeTxHash({ safe, tx, nonce: state.nonce });
    const l = await ctx.lawyer.get<{ signature?: Hex; safeTxHash?: Hex }>("/api/node/recovery/status", { sqRef: a.sq_ref, recoveryId: r.id });
    if (!l.signature || l.safeTxHash?.toLowerCase() !== hash.toLowerCase()) throw new ApiError(409, "HASH_MISMATCH", "The recovery does not match what your lawyer approved.");
    const p3 = await ctx.sq.post<{ signature: Hex }>("/api/node/sign", { recoveryId: r.id, safeTxHash: hash, p2Signature: l.signature });
    const signatures = packSignatures([{ signer: getAddress(a.p2_address), signature: l.signature }, { signer: getAddress(a.p3_address), signature: p3.signature }]);
    const { txHash } = await ctx.sq.post<{ txHash: string }>("/api/gas/exec", { safeAddress: safe, safeTx: { to: tx.to, value: "0", data: tx.data }, signatures });
    await ctx.sq.post("/api/recovery/executed", { recoveryId: r.id, txHash });
    for (const d of await ctx.db.select("devices", { account_id: id, revoked_at: null })) await ctx.db.update("devices", { id: d.id }, { revoked_at: ctx.now.toISOString() });
    await ctx.db.insert("devices", { account_id: id, credential_id: r.new_credential_id, label: "This phone", prf_supported: true, owner_address: newOwner.toLowerCase(), created_at: ctx.now.toISOString() });
    await ctx.db.update("recoveries", { id: r.id }, { status: "completed", swap_tx_hash: txHash, completed_at: ctx.now.toISOString() });
    await touch(ctx, id, { status: "active", p1_address: newOwner.toLowerCase() });
    await ctx.db.update("alerts", { account_id: id, kind: "recovery_requested" }, { read_at: ctx.now.toISOString() });
    return { txHash, explorerUrl: explorerTx(ctx, txHash) };
  } catch (e) {
    await ctx.db.update("recoveries", { id: r.id, status: "executing" }, { status: "awaiting_approval_and_delay" });
    throw e;
  }
}
