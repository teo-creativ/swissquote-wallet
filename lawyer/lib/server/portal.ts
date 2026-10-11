// What the signed-in lawyer sees and does (routes with a session cookie). Every decision is confirmed with a passkey assertion whose
// challenge the SERVER recomputes from the request it is about to apply, so a decision cannot be replayed on another request.
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import canonicalize from "canonicalize";
import { getAddress } from "viem";
import { normalizeAmount, diffPolicy, validatePolicy } from "@/lib/policy";
import type {
  ClientView, JournalEntry, JournalEntryType, JournalView, PolicyEdit, RecoveryInfo, RequestDetail, RequestKind, RequestStatus, RequestSummary, TimelineStep,
} from "@/lib/lawyerApi.types";
import { PARTY } from "@/src/shared/constants";
import { safeTxHash, usdcTransferTx } from "@/src/shared/safe";
import { appendAudit, verifyChain } from "./audit";
import type { Ctx } from "./ctx";
import type { Row } from "./db";
import { ApiError } from "./errors";
import { signHashAsOwner } from "./keys";
import { expireRequests, policyRow, approvedRecipients } from "./nodes";
import { big, formatUsdc, invalid, text, uuid, type Input } from "./util";
import { approvalChallenge, assertionOptions, policyChallenge, verifyBoundAssertion } from "./webauthn";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const iso = (v: string | number) => new Date(v).toISOString();
const DAY_MS = 86_400_000;

// ---- ownership ------------------------------------------------------------------------------------------------------------

async function ownClients(ctx: Ctx, lawyerId: string): Promise<Row[]> {
  return ctx.db.select("clients", { lawyer_id: lawyerId }, { order: ["created_at", "desc"] });
}
async function ownClient(ctx: Ctx, lawyerId: string, clientId: string): Promise<Row> {
  const c = (await ctx.db.select("clients", { id: clientId, lawyer_id: lawyerId }))[0];
  if (!c) throw new ApiError(404, "NOT_FOUND", "This client does not exist.");
  return c;
}
async function ownRequest(ctx: Ctx, lawyerId: string, id: string): Promise<{ request: Row; client: Row }> {
  await expireRequests(ctx);
  const request = (await ctx.db.select("approval_requests", { id }))[0];
  const client = request ? (await ctx.db.select("clients", { id: request.client_id, lawyer_id: lawyerId }))[0] : undefined;
  if (!request || !client) throw new ApiError(404, "NOT_FOUND", "This request does not exist.");
  return { request, client };
}
const passkeysOf = (ctx: Ctx, lawyerId: string) => ctx.db.select("lawyer_passkeys", { lawyer_id: lawyerId });

// ---- views ----------------------------------------------------------------------------------------------------------------

export async function me(ctx: Ctx, lawyerId: string) {
  await expireRequests(ctx);
  const lawyer = (await ctx.db.select("lawyers", { id: lawyerId }))[0];
  if (!lawyer) throw new ApiError(401, "NOT_SIGNED_IN", "Sign in with your passkey to continue.");
  const clients = await ownClients(ctx, lawyerId);
  const pending = (await ctx.db.select("approval_requests", { status: "pending" })).filter((r) => clients.some((c) => c.id === r.client_id)).length;
  return { displayName: lawyer.display_name as string, clients: clients.length, pendingRequests: pending };
}

export async function clientViews(ctx: Ctx, lawyerId: string): Promise<ClientView[]> {
  await expireRequests(ctx);
  const clients = await ownClients(ctx, lawyerId);
  const out: ClientView[] = [];
  for (const c of clients) {
    const reqs = await ctx.db.select("approval_requests", { client_id: c.id });
    const recovering = reqs.some((r) => r.kind === "recovery" && ["pending", "approved"].includes(r.status));
    out.push({
      id: c.id, displayName: c.display_name, address: c.wallet_address ? getAddress(c.wallet_address) : null,
      status: recovering ? "recovering" : c.wallet_address ? "active" : "invited",
      pendingRequests: reqs.filter((r) => r.status === "pending").length,
      policyVersion: Number((await policyRow(ctx, c.id)).version),
    });
  }
  return out;
}

function summaryOf(r: Row, clientName: string): RequestSummary {
  const kind = r.kind as RequestKind;
  return {
    id: r.id, clientId: r.client_id, clientName, kind, status: r.status as RequestStatus,
    ...(kind === "transfer" ? { amount: formatUsdc(big(r.amount_base)), to: getAddress(r.to_address) } : {}),
    ...(kind === "exit" ? { to: getAddress(r.to_address), amount: formatUsdc(big(r.amount_base)) } : {}),
    createdAt: iso(r.created_at), expiresAt: iso(r.expires_at),
  };
}

export async function requestSummaries(ctx: Ctx, lawyerId: string, input: Input): Promise<RequestSummary[]> {
  await expireRequests(ctx);
  const status = typeof input.status === "string" ? input.status : undefined;
  if (status && !["pending", "approved", "refused", "expired"].includes(status)) throw invalid("Unknown status filter.");
  const clients = await ownClients(ctx, lawyerId);
  const rows = (await ctx.db.select("approval_requests", status ? { status } : {}, { order: ["created_at", "desc"] })).filter((r) => clients.some((c) => c.id === r.client_id));
  return rows.map((r) => summaryOf(r, clients.find((c) => c.id === r.client_id)!.display_name));
}

const TIMELINE_LABELS = ["Request received", "Lawyer approval", "Waiting period", "Moving your funds", "Done"];
function timeline(states: TimelineStep["state"][], at: (string | undefined)[]): TimelineStep[] {
  return TIMELINE_LABELS.map((label, i) => ({ label, state: states[i], at: at[i] }));
}

export async function requestDetail(ctx: Ctx, lawyerId: string, input: Input): Promise<RequestDetail> {
  const { request: r, client } = await ownRequest(ctx, lawyerId, uuid(input, "id"));
  const policy = await policyRow(ctx, client.id);
  const base = summaryOf(r, client.display_name);
  const known = r.to_address ? (await approvedRecipients(ctx, client.id)).includes(String(r.to_address).toLowerCase()) : false;
  const history = r.kind === "transfer"
    ? (await ctx.db.select("approval_requests", { client_id: client.id, kind: "transfer", to_address: r.to_address }, { order: ["created_at", "desc"] }))
        .filter((h) => h.id !== r.id && ["approved", "refused"].includes(h.status))
        .map((h) => ({ at: iso(h.decided_at ?? h.created_at), amount: formatUsdc(big(h.amount_base)), result: h.status as "approved" | "refused" }))
    : [];

  let recovery: RecoveryInfo | undefined;
  if (r.kind === "recovery" || r.kind === "exit") {
    const exit = r.kind === "exit" ? (await ctx.db.select("exit_requests", { id: r.external_ref }))[0] : undefined;
    const releaseAfter = exit?.release_after ? iso(exit.release_after) : undefined;
    const states: TimelineStep["state"][] =
      r.status === "pending" ? ["done", "current", "todo", "todo", "todo"]
      : r.status === "approved" ? (releaseAfter && Date.parse(releaseAfter) <= ctx.now.getTime() ? ["done", "done", "done", "current", "todo"] : ["done", "done", "current", "todo", "todo"])
      : r.status === "refused" ? ["done", "failed", "todo", "todo", "todo"] : ["done", "failed", "todo", "todo", "todo"];
    recovery = {
      oldAddress: getAddress(r.safe_address),
      ...(r.kind === "recovery" ? { newAddress: getAddress((r.intent as any).newOwner) } : {}),
      timeline: timeline(states, [iso(r.created_at), r.decided_at ? iso(r.decided_at) : undefined]),
      ...(releaseAfter && r.status === "approved" ? { delayEndsAt: releaseAfter } : {}),
    };
  }
  return {
    ...base, reasons: r.reasons ?? [], recipientHistory: history,
    limits: limitsOf(policy), recipientKnown: known, intentHash: r.intent_hash,
    ...(recovery ? { recovery } : {}), ...(r.decided_at ? { decidedAt: iso(r.decided_at) } : {}),
  };
}

function limitsOf(p: Row) {
  return {
    perTxCap: formatUsdc(big(p.per_tx_cap_base)), dailyCap: formatUsdc(big(p.daily_cap_base)), hourlyCount: Number(p.hourly_count), dailyCount: Number(p.daily_count),
    newRecipientRequiresLawyer: Boolean(p.new_recipient_requires_lawyer),
  };
}

// ---- decisions ------------------------------------------------------------------------------------------------------------

function parseDecision(input: Input): "approve" | "refuse" {
  if (input.decision !== "approve" && input.decision !== "refuse") throw invalid("Field decision must be approve or refuse.");
  return input.decision;
}
function assertDecidable(r: Row, decision: "approve" | "refuse", ctx: Ctx) {
  const cancelling = decision === "refuse" && r.status === "approved" && ["recovery", "exit"].includes(r.kind);
  if (r.status === "expired" || (r.status === "pending" && Date.parse(r.expires_at) < ctx.now.getTime())) throw new ApiError(410, "REQUEST_EXPIRED", "This request expired. Nothing was sent.");
  if (r.status !== "pending" && !cancelling) throw new ApiError(409, "REQUEST_NOT_PENDING", "This request was already decided.");
  return cancelling;
}

/** POST /api/portal/decide/options {id, decision}: the passkey prompt for exactly this request and this decision. */
export async function decideOptions(ctx: Ctx, lawyerId: string, input: Input) {
  const decision = parseDecision(input);
  const { request } = await ownRequest(ctx, lawyerId, uuid(input, "id"));
  assertDecidable(request, decision, ctx);
  return assertionOptions(ctx, await passkeysOf(ctx, lawyerId), approvalChallenge(request.id, request.intent_hash, decision));
}

/** POST /api/portal/decide/verify {id, decision, addRecipient?, response}. */
export async function decideVerify(ctx: Ctx, lawyerId: string, input: Input) {
  const decision = parseDecision(input);
  const response = input.response as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== "object") throw invalid("Field response is missing.");
  const { request: r, client } = await ownRequest(ctx, lawyerId, uuid(input, "id"));
  const cancelling = assertDecidable(r, decision, ctx);

  const assertionHash = await verifyBoundAssertion(ctx, await passkeysOf(ctx, lawyerId), response, approvalChallenge(r.id, r.intent_hash, decision));

  // The first valid decision wins: the status change is the lock.
  const from = cancelling ? "approved" : "pending";
  const next = decision === "approve" ? "approved" : "refused";
  let signature: string | null = null;
  if (r.kind === "transfer" && decision === "approve") {
    const state = await ctx.chain.getSafeState(getAddress(r.safe_address));
    if (state.nonce !== big(r.safe_nonce)) {
      await ctx.db.update("approval_requests", { id: r.id, status: "pending" }, { status: "expired" });
      throw new ApiError(409, "REQUEST_STALE", "The wallet moved on since this request. Nothing was sent.");
    }
    // Rebuilt here, not read from the client: the node signs only the hash it computed itself.
    const hash = safeTxHash({ safe: getAddress(r.safe_address), tx: usdcTransferTx(ctx.config.usdc, getAddress(r.to_address), big(r.amount_base)), nonce: state.nonce });
    if (hash.toLowerCase() !== String(r.safe_tx_hash).toLowerCase()) throw new ApiError(409, "HASH_MISMATCH", "The transaction does not match the request.");
    signature = (await signHashAsOwner(ctx, client.id, hash)).signature;
  }
  const won = await ctx.db.update("approval_requests", { id: r.id, status: from }, {
    status: next, decision, decided_at: ctx.now.toISOString(), decided_by: lawyerId, assertion_hash: assertionHash, ...(signature ? { p2_signature: signature } : {}),
  });
  if (won.length !== 1) throw new ApiError(409, "REQUEST_NOT_PENDING", "This request was already decided.");

  const name = client.display_name;
  if (r.kind === "transfer") {
    await ctx.db.update("decisions", { approval_request_id: r.id }, decision === "approve"
      ? { outcome: "LAWYER_APPROVED", status: "ACTIVE", valid_until: iso(ctx.now.getTime() + ctx.config.lawyerDecisionTtlSeconds * 1000), p2_signature: signature }
      : { status: "REFUSED", outcome: "REFUSED" });
    const verb = decision === "approve" ? "Approved" : "Declined";
    await appendAudit(ctx, `lawyer:${lawyerId}`, "LAWYER_DECIDED", client.id, {
      requestId: r.id, decision, assertion: assertionHash, summary: `${verb} ${formatUsdc(big(r.amount_base))} USDC to ${short(r.to_address)}.`,
    });
    const known = (await approvedRecipients(ctx, client.id)).includes(String(r.to_address).toLowerCase());
    if (decision === "approve" && input.addRecipient === true && !known) await addRecipient(ctx, lawyerId, client, r.to_address);
    return { ok: true };
  }

  const word = r.kind === "recovery" ? "Recovery" : "Exit request";
  if (r.kind === "recovery") {
    await ctx.db.update("recovery_cases", { recovery_id: r.external_ref }, { status: next, lawyer_decision: decision, assertion_hash: assertionHash });
  } else {
    await ctx.db.update("exit_requests", { id: r.external_ref }, {
      status: next, assertion_hash: assertionHash, ...(decision === "approve" ? { release_after: iso(ctx.now.getTime() + ctx.config.exitDelaySeconds * 1000) } : {}),
    });
  }
  await appendAudit(ctx, `lawyer:${lawyerId}`, r.kind === "recovery" ? "RECOVERY_DECIDED" : "EXIT_DECIDED", client.id, {
    requestId: r.id, decision, assertion: assertionHash,
    summary: cancelling ? `${word} cancelled during the waiting period.` : decision === "approve" ? `${word} approved.` : `${word} declined.`,
  });
  return { ok: true, name };
}

async function addRecipient(ctx: Ctx, lawyerId: string, client: Row, address: string) {
  const a = address.toLowerCase();
  const had = (await ctx.db.select("recipients", { client_id: client.id, address: a }))[0];
  if (had) await ctx.db.update("recipients", { client_id: client.id, address: a }, { status: "approved", approved_at: ctx.now.toISOString() });
  else await ctx.db.insert("recipients", { client_id: client.id, address: a, status: "approved", approved_at: ctx.now.toISOString() });
  await appendAudit(ctx, `lawyer:${lawyerId}`, "RECIPIENT_ADDED", client.id, { address: a, summary: `Known recipient added: ${short(a)}.` });
}

// ---- policy ---------------------------------------------------------------------------------------------------------------

export async function policyGet(ctx: Ctx, lawyerId: string, input: Input): Promise<PolicyEdit> {
  const client = await ownClient(ctx, lawyerId, uuid(input, "clientId"));
  const p = await policyRow(ctx, client.id);
  return { ...limitsOf(p), approvedRecipients: (await approvedRecipients(ctx, client.id)).map((a) => getAddress(a)), version: Number(p.version) };
}

function parsePolicy(input: Input): PolicyEdit {
  const p = input.policy as Partial<PolicyEdit> | undefined;
  if (!p || typeof p !== "object") throw invalid("Field policy is missing.");
  const edit: PolicyEdit = {
    perTxCap: String(p.perTxCap ?? ""), dailyCap: String(p.dailyCap ?? ""), hourlyCount: Number(p.hourlyCount), dailyCount: Number(p.dailyCount),
    newRecipientRequiresLawyer: p.newRecipientRequiresLawyer === true, approvedRecipients: Array.isArray(p.approvedRecipients) ? p.approvedRecipients.map(String) : [],
    ...(p.version !== undefined ? { version: Number(p.version) } : {}),
  };
  const problems = validatePolicy(edit);
  if (problems.length) throw new ApiError(400, "INVALID_POLICY", problems[0]);
  return { ...edit, perTxCap: normalizeAmount(edit.perTxCap)!, dailyCap: normalizeAmount(edit.dailyCap)! };
}
const canonicalPolicy = (p: PolicyEdit) =>
  canonicalize({ perTxCap: p.perTxCap, dailyCap: p.dailyCap, hourlyCount: p.hourlyCount, dailyCount: p.dailyCount, newRecipientRequiresLawyer: p.newRecipientRequiresLawyer, approvedRecipients: [...new Set(p.approvedRecipients.map((a) => a.toLowerCase()))].sort() }) ?? "";

async function policyContext(ctx: Ctx, lawyerId: string, input: Input) {
  const client = await ownClient(ctx, lawyerId, uuid(input, "clientId"));
  const next = parsePolicy(input);
  const currentRow = await policyRow(ctx, client.id);
  const current = await policyGet(ctx, lawyerId, { clientId: client.id });
  if (next.version !== undefined && next.version !== Number(currentRow.version)) throw new ApiError(409, "POLICY_VERSION_CONFLICT", "This policy changed since you opened it. Reload and try again.");
  return { client, next, current, currentRow, version: Number(currentRow.version) + 1 };
}

/** POST /api/portal/policy/options {clientId, policy}: the passkey prompt for exactly this new policy version. */
export async function policyOptions(ctx: Ctx, lawyerId: string, input: Input) {
  const { client, next, version } = await policyContext(ctx, lawyerId, input);
  return assertionOptions(ctx, await passkeysOf(ctx, lawyerId), policyChallenge(client.id, version, canonicalPolicy(next)));
}

/** POST /api/portal/policy/verify {clientId, policy, response}. */
export async function policyVerify(ctx: Ctx, lawyerId: string, input: Input) {
  const response = input.response as AuthenticationResponseJSON | undefined;
  if (!response || typeof response !== "object") throw invalid("Field response is missing.");
  const { client, next, current, currentRow, version } = await policyContext(ctx, lawyerId, input);
  const diff = diffPolicy(current, next);
  if (diff.isEmpty) return { ok: true, version: Number(currentRow.version) };
  const assertionHash = await verifyBoundAssertion(ctx, await passkeysOf(ctx, lawyerId), response, policyChallenge(client.id, version, canonicalPolicy(next)));

  const won = await ctx.db.update("policies", { client_id: client.id, version: Number(currentRow.version) }, {
    version, per_tx_cap_base: String(parseBase(next.perTxCap)), daily_cap_base: String(parseBase(next.dailyCap)), hourly_count: next.hourlyCount, daily_count: next.dailyCount,
    new_recipient_requires_lawyer: next.newRecipientRequiresLawyer, updated_at: ctx.now.toISOString(),
  });
  if (won.length !== 1) throw new ApiError(409, "POLICY_VERSION_CONFLICT", "This policy changed since you opened it. Reload and try again.");
  await ctx.db.insert("policy_versions", { client_id: client.id, version, policy: JSON.parse(canonicalPolicy(next)), changed_by: lawyerId, assertion_hash: assertionHash, created_at: ctx.now.toISOString() });

  const parts = diff.changes.map((c) => `${c.label} ${c.before} → ${c.after}`);
  if (diff.addedRecipients.length) parts.push(`${diff.addedRecipients.length} recipient(s) added`);
  if (diff.removedRecipients.length) parts.push(`${diff.removedRecipients.length} recipient(s) revoked`);
  await appendAudit(ctx, `lawyer:${lawyerId}`, "POLICY_CHANGED", client.id, { version, assertion: assertionHash, summary: `Policy v${version} saved: ${parts.join("; ")}.` });
  for (const a of diff.addedRecipients) await addRecipient(ctx, lawyerId, client, a);
  for (const a of diff.removedRecipients) {
    await ctx.db.update("recipients", { client_id: client.id, address: a.toLowerCase() }, { status: "revoked" });
    await appendAudit(ctx, `lawyer:${lawyerId}`, "RECIPIENT_REVOKED", client.id, { address: a.toLowerCase(), summary: `Known recipient revoked: ${short(a)}.` });
  }
  return { ok: true, version };
}
const parseBase = (v: string): bigint => {
  const [i, f = ""] = v.split(".");
  return BigInt(i) * 1_000_000n + BigInt(f.padEnd(6, "0"));
};

// ---- journal --------------------------------------------------------------------------------------------------------------

const JOURNAL_TYPES = new Set<JournalEntryType>(["LAWYER_DECIDED", "POLICY_CHANGED", "RECIPIENT_ADDED", "RECIPIENT_REVOKED", "RECOVERY_REQUESTED", "RECOVERY_DECIDED", "EXIT_REQUESTED", "EXIT_DECIDED", "LOGIN"]);
const REQUESTED_SUMMARY: Record<string, (p: Row) => string> = {
  RECOVERY_REQUESTED: () => "Recovery requested by the client.",
  EXIT_REQUESTED: (p) => `Exit requested: ${formatUsdc(big(p.amountBase))} USDC to ${short(String(p.to))}.`,
};

export async function journal(ctx: Ctx, lawyerId: string, input: Input): Promise<JournalView> {
  const limit = Math.min(Math.max(Number(input.limit ?? 50) || 50, 1), 200);
  const clients = await ownClients(ctx, lawyerId);
  const all = await ctx.db.select("audit_log", {}, { order: ["id", "asc"] });
  const mine = all.filter((e) => (e.client_id ? clients.some((c) => c.id === e.client_id) : e.actor === `lawyer:${lawyerId}`));
  const entries: JournalEntry[] = mine
    .filter((e) => JOURNAL_TYPES.has(e.action))
    .map((e) => ({
      seq: Number(e.id), at: iso(e.ts), type: e.action as JournalEntryType,
      ...(e.client_id ? { clientName: clients.find((c) => c.id === e.client_id)?.display_name } : {}),
      summary: String(e.payload?.summary ?? REQUESTED_SUMMARY[e.action]?.(e.payload ?? {}) ?? (e.action === "LOGIN" ? "Signed in with a passkey." : e.action)),
      hash: String(e.entry_hash).slice(0, 16),
    }))
    .reverse()
    .slice(0, limit);
  const since = new Date(ctx.now.getTime() - DAY_MS).toISOString();
  const autos = (await ctx.db.select("decisions", { outcome: "AUTO", created_at: { gte: since } })).filter((d) => clients.some((c) => c.id === d.client_id));
  return {
    entries, fingerprint: String(all.at(-1)?.entry_hash ?? "").slice(0, 16), integrity: verifyChain(all),
    autoDecisions24h: { count: autos.length, totalUsdc: formatUsdc(autos.reduce((s, d) => s + big(d.amount_base), 0n)) },
  };
}

export async function auditVerify(ctx: Ctx) {
  return verifyChain(await ctx.db.select("audit_log", {}, { order: ["id", "asc"] }));
}
