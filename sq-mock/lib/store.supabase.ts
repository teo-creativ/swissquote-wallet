// Supabase implementation of the Store (tables of sql/001_init.sql). Server only: it uses the service role key,
// which is read from the environment and never leaves this process. RLS is on with no policy, so nothing else can read.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HMAC_NONCE_TTL_MS } from "../src/shared/hmac";
import type { Store } from "./store";
import type {
  AuditEntry, Call, Client, ClientPatch, ComplianceAlert, GasDrip, IdentityCheck, IdentityCheckPatch, OperatorAction, OwnerShare, OwnershipProof, SafeAccount, SponsorAction, SponsorKind, Transfer, WalletLink,
} from "./types";

type Row = Record<string, any>;
type Result<T> = { data: T; error: { code?: string } | null };

const UNIQUE_VIOLATION = "23505";

/** Throws without leaking database details to the caller. */
function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(`Storage error (${error.code ?? "unknown"})`);
  return data;
}
/** For inserts where a duplicate key is an expected answer. */
function inserted({ error }: Result<unknown>): boolean {
  if (!error) return true;
  if (error.code === UNIQUE_VIOLATION) return false;
  throw new Error(`Storage error (${error.code ?? "unknown"})`);
}

const iso = (v: string | null): string | null => (v ? new Date(v).toISOString() : null);

const toClient = (r: Row): Client => ({
  clientId: r.client_id, sqRef: r.sq_ref, name: r.name, passwordHash: r.password_hash, kycStatus: r.kyc_status,
  kycCheckedAt: iso(r.kyc_checked_at), cashChf: Number(r.cash_chf), identityOutcome: r.identity_outcome,
});
const toLink = (r: Row): WalletLink => ({ clientId: r.client_id, address: r.address, linkedAt: iso(r.linked_at)! });
const toProof = (r: Row): OwnershipProof => ({
  id: r.id, clientId: r.client_id, address: r.address, message: r.message, signature: r.signature, method: r.method,
  verified: r.verified, createdAt: iso(r.created_at)!,
});
const toAlert = (r: Row): ComplianceAlert => ({ id: r.id, account: r.account, target: r.target, reason: r.reason, createdAt: iso(r.created_at)! });
const toCall = (r: Row): Call => ({ id: r.id, clientId: r.client_id, reason: r.reason, createdAt: iso(r.created_at)! });
const toCheck = (r: Row): IdentityCheck => ({
  recoveryId: r.recovery_id, clientId: r.client_id, outcome: r.outcome, identityVerifiedAt: iso(r.identity_verified_at),
  releaseAfter: iso(r.release_after), cancelledAt: iso(r.cancelled_at), usedAt: iso(r.used_at), oldAddress: r.old_address,
  createdAt: iso(r.created_at)!, safeAddress: r.safe_address ?? null, newOwnerAddress: r.new_owner_address ?? null,
  safeTxHash: r.safe_tx_hash ?? null, p3SignedAt: iso(r.p3_signed_at ?? null), executedTxHash: r.executed_tx_hash ?? null,
});
// bytea columns travel as PostgREST hex strings (backslash x prefix); the domain keeps plain hex.
const BYTEA_PREFIX = "\\x";
const toBytea = (hex: string) => BYTEA_PREFIX + hex;
const fromBytea = (v: string) => (v.startsWith(BYTEA_PREFIX) ? v.slice(BYTEA_PREFIX.length) : v);
const toShare = (r: Row): OwnerShare => ({
  sqRef: r.client_id, generation: r.generation, address: r.address, keyshareEnc: fromBytea(r.keyshare_enc), nonce: fromBytea(r.nonce),
  keyVersion: r.key_version, createdAt: iso(r.created_at)!,
});
const toSafe = (r: Row): SafeAccount => ({
  sqRef: r.sq_ref, safeAddress: r.safe_address, p1Address: r.p1_address, p2Address: r.p2_address, p3Address: r.p3_address, saltNonce: r.salt_nonce,
  deployTxHash: r.deploy_tx_hash, createdAt: iso(r.created_at)!,
});
const toSponsor = (r: Row): SponsorAction => ({ id: r.id, kind: r.kind, sqRef: r.sq_ref, safeAddress: r.safe_address, txHash: r.tx_hash, createdAt: iso(r.created_at)! });
const toOperator = (r: Row): OperatorAction => ({ id: r.id, action: r.action, clientId: r.client_id, recoveryId: r.recovery_id, detail: r.detail, createdAt: iso(r.created_at)! });
const toAudit = (r: Row): AuditEntry => ({ id: r.id, ts: iso(r.ts)!, action: r.action, payload: r.payload, prevHash: r.prev_hash, entryHash: r.entry_hash });

export class SupabaseStore implements Store {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async claim(nonce: string, now: Date) {
    await this.db.from("seen_nonces").delete().lt("seen_at", new Date(now.getTime() - HMAC_NONCE_TTL_MS).toISOString());
    return inserted(await this.db.from("seen_nonces").insert({ nonce, seen_at: now.toISOString() }));
  }

  async getClient(clientId: string) {
    const r = unwrap(await this.db.from("clients").select("*").eq("client_id", clientId).maybeSingle());
    return r ? toClient(r) : null;
  }
  async getClientBySqRef(sqRef: string) {
    const r = unwrap(await this.db.from("clients").select("*").eq("sq_ref", sqRef).maybeSingle());
    return r ? toClient(r) : null;
  }
  async listClients() {
    return (unwrap(await this.db.from("clients").select("*").order("client_id")) ?? []).map(toClient);
  }
  async insertClientIfAbsent(c: Client) {
    return inserted(await this.db.from("clients").insert({
      client_id: c.clientId, sq_ref: c.sqRef, name: c.name, password_hash: c.passwordHash, kyc_status: c.kycStatus,
      kyc_checked_at: c.kycCheckedAt, cash_chf: c.cashChf, identity_outcome: c.identityOutcome,
    }));
  }
  async updateClient(clientId: string, patch: ClientPatch) {
    const row: Row = {};
    if (patch.kycStatus !== undefined) row.kyc_status = patch.kycStatus;
    if (patch.kycCheckedAt !== undefined) row.kyc_checked_at = patch.kycCheckedAt;
    if (patch.cashChf !== undefined) row.cash_chf = patch.cashChf;
    if (patch.identityOutcome !== undefined) row.identity_outcome = patch.identityOutcome;
    unwrap(await this.db.from("clients").update(row).eq("client_id", clientId));
  }

  async getLinkByAddress(address: string) {
    const r = unwrap(await this.db.from("wallet_links").select("*").eq("address", address).maybeSingle());
    return r ? toLink(r) : null;
  }
  async getLatestLink(clientId: string) {
    const r = unwrap(await this.db.from("wallet_links").select("*").eq("client_id", clientId).order("linked_at", { ascending: false }).limit(1).maybeSingle());
    return r ? toLink(r) : null;
  }
  async listLinks() {
    return (unwrap(await this.db.from("wallet_links").select("*")) ?? []).map(toLink);
  }
  async addLink(link: WalletLink) {
    unwrap(await this.db.from("wallet_links").insert({ client_id: link.clientId, address: link.address, linked_at: link.linkedAt }));
  }

  async addProof(p: Omit<OwnershipProof, "id">) {
    unwrap(await this.db.from("ownership_proofs").insert({
      client_id: p.clientId, address: p.address, message: p.message, signature: p.signature, method: p.method, verified: p.verified, created_at: p.createdAt,
    }));
  }
  async listProofs() {
    return (unwrap(await this.db.from("ownership_proofs").select("*").order("created_at", { ascending: false })) ?? []).map(toProof);
  }

  async addTransfer(t: Omit<Transfer, "id">) {
    unwrap(await this.db.from("transfers").insert({ client_id: t.clientId, address: t.address, amount_usdc: t.amountUsdc, tx_hash: t.txHash, created_at: t.createdAt }));
  }
  async countTransfersSince(clientId: string, since: string) {
    const { count, error } = await this.db.from("transfers").select("id", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", since);
    unwrap({ data: null, error });
    return count ?? 0;
  }

  async addGasDrip(d: Omit<GasDrip, "id">) {
    unwrap(await this.db.from("gas_drips").insert({ address: d.address, amount_wei: d.amountWei, tx_hash: d.txHash, created_at: d.createdAt }));
  }
  async countGasDripsSince(since: string, address?: string) {
    let q = this.db.from("gas_drips").select("id", { count: "exact", head: true }).gte("created_at", since);
    if (address !== undefined) q = q.eq("address", address);
    const { count, error } = await q;
    unwrap({ data: null, error });
    return count ?? 0;
  }

  async getSanction(address: string) {
    const r = unwrap(await this.db.from("sanctioned_addresses").select("list_version").eq("address", address).maybeSingle());
    return r ? (r.list_version as string) : null;
  }
  async addSanction(address: string, listVersion: string) {
    unwrap(await this.db.from("sanctioned_addresses").upsert({ address, list_version: listVersion }));
  }

  async addComplianceAlert(a: Omit<ComplianceAlert, "id">) {
    unwrap(await this.db.from("compliance_alerts").insert({ account: a.account, target: a.target, reason: a.reason, created_at: a.createdAt }));
  }
  async listComplianceAlerts() {
    return (unwrap(await this.db.from("compliance_alerts").select("*").order("created_at", { ascending: false })) ?? []).map(toAlert);
  }
  async addCall(c: Omit<Call, "id">) {
    unwrap(await this.db.from("calls").insert({ client_id: c.clientId, reason: c.reason, created_at: c.createdAt }));
  }
  async listCalls() {
    return (unwrap(await this.db.from("calls").select("*").order("created_at", { ascending: false })) ?? []).map(toCall);
  }

  async createIdentityCheck(c: IdentityCheck) {
    return inserted(await this.db.from("identity_checks").insert({
      recovery_id: c.recoveryId, client_id: c.clientId, outcome: c.outcome, identity_verified_at: c.identityVerifiedAt,
      release_after: c.releaseAfter, cancelled_at: c.cancelledAt, used_at: c.usedAt, old_address: c.oldAddress, created_at: c.createdAt,
      safe_address: c.safeAddress ?? null, new_owner_address: c.newOwnerAddress ?? null,
    }));
  }
  async getIdentityCheck(recoveryId: string) {
    const r = unwrap(await this.db.from("identity_checks").select("*").eq("recovery_id", recoveryId).maybeSingle());
    return r ? toCheck(r) : null;
  }
  async updateIdentityCheck(recoveryId: string, patch: IdentityCheckPatch) {
    const row: Row = {};
    if (patch.outcome !== undefined) row.outcome = patch.outcome;
    if (patch.identityVerifiedAt !== undefined) row.identity_verified_at = patch.identityVerifiedAt;
    if (patch.releaseAfter !== undefined) row.release_after = patch.releaseAfter;
    if (patch.cancelledAt !== undefined) row.cancelled_at = patch.cancelledAt;
    if (patch.usedAt !== undefined) row.used_at = patch.usedAt;
    if (patch.newOwnerAddress !== undefined) row.new_owner_address = patch.newOwnerAddress;
    if (patch.safeTxHash !== undefined) row.safe_tx_hash = patch.safeTxHash;
    if (patch.p3SignedAt !== undefined) row.p3_signed_at = patch.p3SignedAt;
    if (patch.executedTxHash !== undefined) row.executed_tx_hash = patch.executedTxHash;
    unwrap(await this.db.from("identity_checks").update(row).eq("recovery_id", recoveryId));
  }
  async listIdentityChecks() {
    return (unwrap(await this.db.from("identity_checks").select("*").order("created_at", { ascending: false })) ?? []).map(toCheck);
  }

  async insertOwnerShareIfAbsent(s: OwnerShare) {
    return inserted(await this.db.from("shares").insert({
      client_id: s.sqRef, generation: s.generation, party_id: 3, public_key: s.address, address: s.address, keyshare_enc: toBytea(s.keyshareEnc),
      nonce: toBytea(s.nonce), key_version: s.keyVersion, status: "active", created_at: s.createdAt,
    }));
  }
  async getOwnerShare(sqRef: string) {
    const r = unwrap(await this.db.from("shares").select("*").eq("client_id", sqRef).eq("status", "active").order("generation", { ascending: false }).limit(1).maybeSingle());
    return r ? toShare(r) : null;
  }

  async insertSafeAccountIfAbsent(a: SafeAccount) {
    return inserted(await this.db.from("safe_accounts").insert({
      sq_ref: a.sqRef, safe_address: a.safeAddress, p1_address: a.p1Address, p2_address: a.p2Address, p3_address: a.p3Address, salt_nonce: a.saltNonce,
      deploy_tx_hash: a.deployTxHash, created_at: a.createdAt,
    }));
  }
  async getSafeAccount(sqRef: string) {
    const r = unwrap(await this.db.from("safe_accounts").select("*").eq("sq_ref", sqRef).maybeSingle());
    return r ? toSafe(r) : null;
  }
  async getSafeAccountByAddress(address: string) {
    const r = unwrap(await this.db.from("safe_accounts").select("*").eq("safe_address", address).maybeSingle());
    return r ? toSafe(r) : null;
  }
  async listSafeAccounts() {
    return (unwrap(await this.db.from("safe_accounts").select("*").order("created_at", { ascending: false })) ?? []).map(toSafe);
  }

  async addSponsorAction(a: Omit<SponsorAction, "id">) {
    unwrap(await this.db.from("sponsor_actions").insert({ kind: a.kind, sq_ref: a.sqRef, safe_address: a.safeAddress, tx_hash: a.txHash, created_at: a.createdAt }));
  }
  async countSponsorActionsSince(kind: SponsorKind, since: string, safeAddress?: string) {
    let q = this.db.from("sponsor_actions").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since);
    if (safeAddress !== undefined) q = q.eq("safe_address", safeAddress);
    const { count, error } = await q;
    unwrap({ data: null, error });
    return count ?? 0;
  }

  async addOperatorAction(a: Omit<OperatorAction, "id">) {
    unwrap(await this.db.from("operator_actions").insert({ action: a.action, client_id: a.clientId, recovery_id: a.recoveryId, detail: a.detail, created_at: a.createdAt }));
  }
  async listOperatorActions() {
    return (unwrap(await this.db.from("operator_actions").select("*").order("created_at", { ascending: false }).limit(200)) ?? []).map(toOperator);
  }

  async getLastAuditHash() {
    const r = unwrap(await this.db.from("audit_log").select("entry_hash").order("id", { ascending: false }).limit(1).maybeSingle());
    return r ? (r.entry_hash as string) : null;
  }
  async insertAudit(e: Omit<AuditEntry, "id">) {
    unwrap(await this.db.from("audit_log").insert({ ts: e.ts, action: e.action, payload: e.payload, prev_hash: e.prevHash, entry_hash: e.entryHash }));
  }
  async listAudit() {
    return (unwrap(await this.db.from("audit_log").select("*").order("id")) ?? []).map(toAudit);
  }
}
