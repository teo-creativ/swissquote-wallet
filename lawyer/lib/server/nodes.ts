// P2 node: what the client app server asks of the lawyer node (all HMAC, APP_TO_LAWYER_SECRET).
// Rule of the node: it NEVER signs a hash it did not build itself. Every request carries the facts ({safe, to, amount, nonce}) and the
// node rebuilds the Safe transaction, compares its hash with the client's, runs the policy, and only then signs or queues the request.
import { getAddress, type Address, type Hex } from "viem";
import { PARTY } from "@/src/shared/constants";
import { evaluatePolicy, type PolicyConfig } from "@/src/shared/policy";
import { SAFE_THRESHOLD, safeTxHash, swapOwnerTx, usdcTransferTx } from "@/src/shared/safe";
import { appendAudit } from "./audit";
import type { Ctx } from "./ctx";
import type { Row } from "./db";
import { ApiError } from "./errors";
import { ownerAddress, ownerCreate, signHashAsOwner } from "./keys";
import { addressOf, baseUnits, big, formatUsdc, intentHashOf, invalid, sha256Hex, text, uuid, withLock, type Input } from "./util";

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

// ---- clients, policy ------------------------------------------------------------------------------------------------------

export async function acceptedClient(ctx: Ctx, input: Input): Promise<Row> {
  const client = (await ctx.db.select("clients", { sq_ref: uuid(input, "sqRef") }))[0];
  if (!client) throw new ApiError(404, "UNKNOWN_CLIENT", "Unknown client.");
  if (!client.lawyer_id || !["accepted", "active"].includes(client.status)) throw new ApiError(409, "LAWYER_NOT_ACCEPTED", "No lawyer has accepted this client yet.");
  return client;
}

export function policyConfigOf(row: Row): PolicyConfig {
  return {
    perTxCapBase: big(row.per_tx_cap_base), dailyCapBase: big(row.daily_cap_base), hourlyCount: Number(row.hourly_count), dailyCount: Number(row.daily_count),
    newRecipientRequiresLawyer: Boolean(row.new_recipient_requires_lawyer), maxPendingApprovals: Number(row.max_pending_approvals),
  };
}
export async function policyRow(ctx: Ctx, clientId: string): Promise<Row> {
  const row = (await ctx.db.select("policies", { client_id: clientId }))[0];
  if (!row) throw new ApiError(404, "NO_POLICY", "No policy exists for this client.");
  return row;
}
export async function approvedRecipients(ctx: Ctx, clientId: string): Promise<string[]> {
  return (await ctx.db.select("recipients", { client_id: clientId, status: "approved" })).map((r) => String(r.address).toLowerCase());
}

// ---- the Safe -------------------------------------------------------------------------------------------------------------

/**
 * Checks on the chain that this Safe really is the client's: 2-of-3, with this node's P2 key as the SECOND owner (the deployment order is
 * [P1 client, P2 lawyer, P3 Swissquote], and swapOwner keeps positions). Registers the wallet on first sight.
 */
async function checkedSafe(ctx: Ctx, client: Row, safeAddress: Address) {
  const p2 = await ownerAddress(ctx, client.id);
  if (!p2) throw new ApiError(409, "OWNER_NOT_CREATED", "The lawyer key does not exist yet.");
  const safe = getAddress(safeAddress);
  if (client.wallet_address && client.wallet_address !== safe.toLowerCase()) throw new ApiError(409, "WALLET_MISMATCH", "This is not the wallet registered for this client.");
  const state = await ctx.chain.getSafeState(safe).catch(() => {
    throw new ApiError(404, "SAFE_NOT_FOUND", "This wallet does not exist on chain yet.");
  });
  if (state.owners.length !== 3 || state.threshold !== SAFE_THRESHOLD || state.owners[PARTY.LAWYER].toLowerCase() !== p2.toLowerCase())
    throw new ApiError(403, "NOT_OUR_SAFE", "The lawyer is not an owner of this wallet.");
  if (!client.wallet_address) {
    await ctx.db.update("clients", { id: client.id }, { wallet_address: safe.toLowerCase(), status: "active" });
    await appendAudit(ctx, "node", "WALLET_REGISTERED", client.id, { safe: safe.toLowerCase() });
    client.wallet_address = safe.toLowerCase();
  }
  return { safe, state, p2 };
}

/** POST /api/node/owner/create {sqRef}: the P2 address (idempotent). */
export async function nodeOwnerCreate(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  return { address: await ownerCreate(ctx, client.id) };
}

/** POST /api/node/wallet/register {sqRef, safeAddress}. */
export async function walletRegister(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  const { safe } = await checkedSafe(ctx, client, addressOf(input, "safeAddress"));
  return { registered: true, safeAddress: safe };
}

// ---- transfers ------------------------------------------------------------------------------------------------------------

type TransferResult =
  | { status: "signed"; outcome: "AUTO"; reasons: string[]; signature: Hex; signer: Address; expiresAt: string }
  | { status: "pending"; outcome: "LAWYER"; reasons: string[]; requestId: string; expiresAt: string }
  | { status: "refused"; outcome: "REFUSED"; reasons: string[] };

/** The policy decision for a transfer, from the client's own policy and history. Reserves nothing. */
async function decideTransfer(ctx: Ctx, client: Row, to: Address, amount: bigint) {
  const policy = await policyRow(ctx, client.id);
  const now = ctx.now.getTime();
  const autos = (await ctx.db.select("decisions", { client_id: client.id, outcome: "AUTO", created_at: { gte: iso(now - DAY_MS) } }))
    .filter((d) => d.status !== "CANCELLED")
    .map((d) => ({ at: Date.parse(d.created_at), amountBase: big(d.amount_base) }));
  const pending = (await ctx.db.select("approval_requests", { client_id: client.id, status: "pending" })).length;
  const sanctioned = (await ctx.db.select("sanctioned_addresses")).map((r) => String(r.address).toLowerCase());
  const decision = evaluatePolicy(
    { kind: "usdc_transfer", to, amountBase: amount },
    { approvedRecipients: await approvedRecipients(ctx, client.id), autoDecisions: autos, pendingCount: pending, sanctioned },
    policyConfigOf(policy), now,
  );
  return { decision, policy };
}

/** POST /api/node/transfer/check {sqRef, to, amount}: what the policy would say now. Nothing is reserved, nothing is signed. */
export async function transferCheck(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  const to = addressOf(input, "to");
  const amount = baseUnits(input, "amount");
  if (amount <= 0n) return { outcome: "REFUSED" as const, reasons: ["INVALID_AMOUNT"] };
  const { decision } = await decideTransfer(ctx, client, to, amount);
  return { outcome: decision.outcome, reasons: decision.reasons };
}

/** GET /api/node/policy?sqRef: the client's limits and known recipients (read only). */
export async function policyView(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  const p = await policyRow(ctx, client.id);
  return {
    perTxCap: formatUsdc(big(p.per_tx_cap_base)), dailyCap: formatUsdc(big(p.daily_cap_base)), hourlyCount: Number(p.hourly_count), dailyCount: Number(p.daily_count),
    newRecipientRequiresLawyer: Boolean(p.new_recipient_requires_lawyer), approvedRecipients: (await approvedRecipients(ctx, client.id)).map((a) => getAddress(a)),
  };
}

/** POST /api/node/transfer/request {sqRef, safeAddress, to, amount, nonce, safeTxHash}. */
export async function transferRequest(ctx: Ctx, input: Input): Promise<TransferResult> {
  const client = await acceptedClient(ctx, input);
  const to = addressOf(input, "to");
  const amount = baseUnits(input, "amount");
  const nonce = baseUnits(input, "nonce");
  const claimed = text(input, "safeTxHash", 66).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(claimed)) throw invalid("Field safeTxHash is not a 32 byte hash.");

  return withLock(client.id, async () => {
    const { safe, state } = await checkedSafe(ctx, client, addressOf(input, "safeAddress"));

    // Retry of a request already answered: same answer, nothing new reserved.
    const prior = (await ctx.db.select("decisions", { client_id: client.id, request_ref: claimed }))[0];
    if (prior) return replay(ctx, client, prior);

    if (amount <= 0n) {
      await ctx.db.insert("decisions", { client_id: client.id, request_ref: claimed, intent_hash: sha256Hex(claimed), outcome: "REFUSED", status: "REFUSED", amount_base: "0", policy_version: 0, reasons: ["INVALID_AMOUNT"], safe_tx_hash: claimed, created_at: ctx.now.toISOString() });
      return { status: "refused", outcome: "REFUSED", reasons: ["INVALID_AMOUNT"] };
    }
    if (nonce !== state.nonce) throw new ApiError(409, "NONCE_MISMATCH", "Another transaction is in progress for this wallet. Try again in a moment.");
    // The node builds the transaction itself. It never signs a hash it did not build.
    const hash = safeTxHash({ safe, tx: usdcTransferTx(ctx.config.usdc, to, amount), nonce: state.nonce });
    if (hash.toLowerCase() !== claimed) throw new ApiError(409, "HASH_MISMATCH", "The transaction does not match the request.");

    const now = ctx.now.getTime();
    const { decision, policy } = await decideTransfer(ctx, client, to, amount);
    const intent = { v: 1, kind: "transfer", clientId: client.id, safe: safe.toLowerCase(), to: to.toLowerCase(), amountBase: amount.toString(), nonce: nonce.toString(), safeTxHash: hash, chainId: ctx.config.chainId };
    const intentHash = intentHashOf(intent);
    const base = { client_id: client.id, request_ref: hash, intent_hash: intentHash, amount_base: amount.toString(), policy_version: policy.version, reasons: decision.reasons, safe_tx_hash: hash, created_at: ctx.now.toISOString() };

    if (decision.outcome === "REFUSED") {
      await ctx.db.insert("decisions", { ...base, outcome: "REFUSED", status: "REFUSED" });
      await appendAudit(ctx, "node", "TRANSFER_REFUSED", client.id, { to: to.toLowerCase(), amountBase: amount.toString(), reasons: decision.reasons });
      return { status: "refused", outcome: "REFUSED", reasons: decision.reasons };
    }
    if (decision.outcome === "AUTO") {
      const validUntil = iso(now + ctx.config.autoDecisionTtlSeconds * 1000);
      const { signature, signer } = await signHashAsOwner(ctx, client.id, hash);
      await ctx.db.insert("decisions", { ...base, outcome: "AUTO", status: "ACTIVE", valid_until: validUntil, p2_signature: signature });
      await appendAudit(ctx, "node", "AUTO_DECISION", client.id, { to: to.toLowerCase(), amountBase: amount.toString(), policyVersion: policy.version });
      return { status: "signed", outcome: "AUTO", reasons: decision.reasons, signature, signer, expiresAt: validUntil };
    }
    const expiresAt = iso(now + ctx.config.requestTtlSeconds * 1000);
    const request = await ctx.db.insert("approval_requests", {
      client_id: client.id, kind: "transfer", external_ref: hash, intent, intent_hash: intentHash, reasons: decision.reasons, status: "pending", expires_at: expiresAt,
      safe_address: safe.toLowerCase(), to_address: to.toLowerCase(), amount_base: amount.toString(), safe_nonce: nonce.toString(), safe_tx_hash: hash, created_at: ctx.now.toISOString(),
    });
    await ctx.db.insert("decisions", { ...base, approval_request_id: request.id, outcome: "LAWYER", status: "PENDING" });
    await appendAudit(ctx, "node", "TRANSFER_REQUESTED", client.id, { requestId: request.id, to: to.toLowerCase(), amountBase: amount.toString(), reasons: decision.reasons });
    return { status: "pending", outcome: "LAWYER", reasons: decision.reasons, requestId: request.id, expiresAt };
  });
}

async function replay(ctx: Ctx, client: Row, decision: Row): Promise<TransferResult> {
  const reasons = decision.reasons as string[];
  if (decision.outcome === "REFUSED") return { status: "refused", outcome: "REFUSED", reasons };
  if (decision.outcome === "AUTO") {
    if (Date.parse(decision.valid_until) < ctx.now.getTime()) throw new ApiError(410, "DECISION_EXPIRED", "This approval expired. Start the transfer again.");
    return { status: "signed", outcome: "AUTO", reasons, signature: decision.p2_signature, signer: (await ownerAddress(ctx, client.id))!, expiresAt: new Date(decision.valid_until).toISOString() };
  }
  const request = (await ctx.db.select("approval_requests", { id: decision.approval_request_id }))[0];
  return { status: "pending", outcome: "LAWYER", reasons, requestId: request.id, expiresAt: new Date(request.expires_at).toISOString() };
}

/** Marks pending requests whose time ran out. Called whenever requests are read. */
export async function expireRequests(ctx: Ctx, clientIds?: string[]) {
  const where = { status: "pending", expires_at: { lt: ctx.now.toISOString() } };
  for (const r of await ctx.db.select("approval_requests", where)) {
    if (clientIds && !clientIds.includes(r.client_id)) continue;
    const done = await ctx.db.update("approval_requests", { id: r.id, status: "pending" }, { status: "expired" });
    if (done.length) await ctx.db.update("decisions", { approval_request_id: r.id }, { status: "EXPIRED" });
  }
}

/** GET /api/node/transfer/status?sqRef&requestId. */
export async function transferStatus(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  await expireRequests(ctx, [client.id]);
  const request = (await ctx.db.select("approval_requests", { id: uuid(input, "requestId"), client_id: client.id, kind: "transfer" }))[0];
  if (!request) throw new ApiError(404, "UNKNOWN_REQUEST", "Unknown request.");
  const out: Record<string, unknown> = { status: request.status, expiresAt: new Date(request.expires_at).toISOString() };
  if (request.status === "approved") {
    const decision = (await ctx.db.select("decisions", { approval_request_id: request.id }))[0];
    if (decision && Date.parse(decision.valid_until) < ctx.now.getTime()) return { ...out, status: "expired" };
    out.signature = request.p2_signature;
    out.signer = await ownerAddress(ctx, client.id);
    out.validUntil = decision ? new Date(decision.valid_until).toISOString() : undefined;
  }
  return out;
}

// ---- recovery -------------------------------------------------------------------------------------------------------------

/** POST /api/node/recovery/request {sqRef, recoveryId, safeAddress, newOwnerAddress}: always goes to the lawyer. */
export async function recoveryRequest(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  const recoveryId = uuid(input, "recoveryId");
  const newOwner = getAddress(addressOf(input, "newOwnerAddress"));
  const { safe, state } = await checkedSafe(ctx, client, addressOf(input, "safeAddress"));
  if (state.owners.some((o) => o.toLowerCase() === newOwner.toLowerCase())) throw new ApiError(409, "ALREADY_OWNER", "This key already controls the wallet.");

  const existing = (await ctx.db.select("recovery_cases", { recovery_id: recoveryId }))[0];
  if (existing) return { status: existing.status, requestId: (await ctx.db.select("approval_requests", { external_ref: recoveryId }))[0]?.id };

  const oldOwner = state.owners[PARTY.CLIENT];
  const intent = { v: 1, kind: "recovery", clientId: client.id, recoveryId, safe: safe.toLowerCase(), oldOwner: oldOwner.toLowerCase(), newOwner: newOwner.toLowerCase(), chainId: ctx.config.chainId };
  const expiresAt = iso(ctx.now.getTime() + ctx.config.requestTtlSeconds * 1000);
  const request = await ctx.db.insert("approval_requests", {
    client_id: client.id, kind: "recovery", external_ref: recoveryId, intent, intent_hash: intentHashOf(intent), reasons: [], status: "pending", expires_at: expiresAt,
    safe_address: safe.toLowerCase(), created_at: ctx.now.toISOString(),
  });
  await ctx.db.insert("recovery_cases", {
    recovery_id: recoveryId, client_id: client.id, old_address: safe.toLowerCase(), new_address: newOwner.toLowerCase(), status: "pending",
    safe_address: safe.toLowerCase(), new_owner_address: newOwner.toLowerCase(), created_at: ctx.now.toISOString(),
  });
  await appendAudit(ctx, "node", "RECOVERY_REQUESTED", client.id, { recoveryId, requestId: request.id, safe: safe.toLowerCase(), newOwner: newOwner.toLowerCase() });
  return { status: "pending", requestId: request.id, expiresAt };
}

/**
 * GET /api/node/recovery/status?sqRef&recoveryId. Once the lawyer approved, the P2 signature is made NOW over the swapOwner hash this
 * node rebuilds from the current chain state (so it is always the right nonce) and it is only given out while the case is open.
 */
export async function recoveryStatus(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  await expireRequests(ctx, [client.id]);
  const recoveryId = uuid(input, "recoveryId");
  const rc = (await ctx.db.select("recovery_cases", { recovery_id: recoveryId, client_id: client.id }))[0];
  const request = (await ctx.db.select("approval_requests", { external_ref: recoveryId, client_id: client.id, kind: "recovery" }))[0];
  if (!rc || !request) throw new ApiError(404, "UNKNOWN_RECOVERY", "Unknown recovery.");
  const out: Record<string, unknown> = { status: request.status, expiresAt: new Date(request.expires_at).toISOString() };
  if (request.status !== "approved") return out;

  const safe = getAddress(rc.safe_address);
  const state = await ctx.chain.getSafeState(safe);
  const newOwner = getAddress(rc.new_owner_address);
  if (state.owners.some((o) => o.toLowerCase() === newOwner.toLowerCase())) return { ...out, status: "done" };
  const tx = swapOwnerTx({ safe, owners: state.owners, oldOwner: state.owners[PARTY.CLIENT], newOwner });
  const hash = safeTxHash({ safe, tx, nonce: state.nonce });
  const { signature, signer } = await signHashAsOwner(ctx, client.id, hash);
  await ctx.db.update("recovery_cases", { recovery_id: recoveryId }, { safe_tx_hash: hash, p2_signature: signature });
  return { ...out, safeTxHash: hash, signature, signer };
}

// ---- exit without Swissquote ----------------------------------------------------------------------------------------------

/** POST /api/node/exit/request {sqRef, safeAddress, to, amount?}: P1 + P2, always manual. amount omitted = the whole USDC balance. */
export async function exitRequest(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  const to = getAddress(addressOf(input, "to"));
  const { safe } = await checkedSafe(ctx, client, addressOf(input, "safeAddress"));
  const amount = input.amount === undefined ? await ctx.chain.usdcBalance(safe) : baseUnits(input, "amount");
  if (amount <= 0n) throw new ApiError(400, "NOTHING_TO_EXIT", "The wallet holds no USDC to move.");

  const exitId = crypto.randomUUID();
  const intent = { v: 1, kind: "exit", clientId: client.id, exitId, safe: safe.toLowerCase(), to: to.toLowerCase(), amountBase: amount.toString(), chainId: ctx.config.chainId };
  const expiresAt = iso(ctx.now.getTime() + ctx.config.requestTtlSeconds * 1000);
  const request = await ctx.db.insert("approval_requests", {
    client_id: client.id, kind: "exit", external_ref: exitId, intent, intent_hash: intentHashOf(intent), reasons: [], status: "pending", expires_at: expiresAt,
    safe_address: safe.toLowerCase(), to_address: to.toLowerCase(), amount_base: amount.toString(), created_at: ctx.now.toISOString(),
  });
  await ctx.db.insert("exit_requests", { id: exitId, client_id: client.id, to_address: to.toLowerCase(), token_hash: sha256Hex(exitId), status: "pending", created_at: ctx.now.toISOString() });
  await appendAudit(ctx, "node", "EXIT_REQUESTED", client.id, { exitId, requestId: request.id, to: to.toLowerCase(), amountBase: amount.toString() });
  return { exitId, requestId: request.id, amount: amount.toString(), expiresAt };
}

/** GET /api/node/exit/status?sqRef&exitId. The signature is released only after the approval AND the exit delay. */
export async function exitStatus(ctx: Ctx, input: Input) {
  const client = await acceptedClient(ctx, input);
  await expireRequests(ctx, [client.id]);
  const exitId = uuid(input, "exitId");
  const ex = (await ctx.db.select("exit_requests", { id: exitId, client_id: client.id }))[0];
  const request = (await ctx.db.select("approval_requests", { external_ref: exitId, client_id: client.id, kind: "exit" }))[0];
  if (!ex || !request) throw new ApiError(404, "UNKNOWN_EXIT", "Unknown exit request.");
  const out: Record<string, unknown> = { status: request.status, expiresAt: new Date(request.expires_at).toISOString(), releaseAfter: ex.release_after ? new Date(ex.release_after).toISOString() : null };
  if (request.status !== "approved") return out;
  if (!ex.release_after || Date.parse(ex.release_after) > ctx.now.getTime()) return { ...out, status: "waiting" };

  const safe = getAddress(request.safe_address);
  const state = await ctx.chain.getSafeState(safe);
  const hash = safeTxHash({ safe, tx: usdcTransferTx(ctx.config.usdc, getAddress(request.to_address), big(request.amount_base)), nonce: state.nonce });
  const { signature, signer } = await signHashAsOwner(ctx, client.id, hash);
  await ctx.db.update("exit_requests", { id: exitId }, { safe_tx_hash: hash, p2_signature: signature });
  return { ...out, to: request.to_address, amount: String(big(request.amount_base)), nonce: state.nonce.toString(), safeTxHash: hash, signature, signer };
}
