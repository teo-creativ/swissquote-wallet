// Storage of the Swissquote mock. Two implementations: MemoryStore (tests, local dev without Supabase) and
// SupabaseStore (lib/store.supabase.ts, server only). The interface holds no business rule: rules live in lib/services.
import { HMAC_NONCE_TTL_MS, type NonceStore } from "../src/shared/hmac";
import type {
  AuditEntry, Call, Client, ClientPatch, ComplianceAlert, GasDrip, IdentityCheck, IdentityCheckPatch, OwnershipProof, Transfer, WalletLink,
} from "./types";

export interface Store extends NonceStore {
  getClient(clientId: string): Promise<Client | null>;
  getClientBySqRef(sqRef: string): Promise<Client | null>;
  listClients(): Promise<Client[]>;
  /** Inserts the client unless the client_id already exists. Resolves true when a row was created. */
  insertClientIfAbsent(client: Client): Promise<boolean>;
  updateClient(clientId: string, patch: ClientPatch): Promise<void>;

  getLinkByAddress(address: string): Promise<WalletLink | null>;
  /** Most recent linked address of the client. */
  getLatestLink(clientId: string): Promise<WalletLink | null>;
  listLinks(): Promise<WalletLink[]>;
  addLink(link: WalletLink): Promise<void>;

  addProof(proof: Omit<OwnershipProof, "id">): Promise<void>;
  listProofs(): Promise<OwnershipProof[]>;

  addTransfer(transfer: Omit<Transfer, "id">): Promise<void>;
  countTransfersSince(clientId: string, since: string): Promise<number>;

  addGasDrip(drip: Omit<GasDrip, "id">): Promise<void>;
  /** Without an address: every drip since the date (global cap). */
  countGasDripsSince(since: string, address?: string): Promise<number>;

  /** Resolves the list version when the address is on the simulated sanctions list, null otherwise. */
  getSanction(address: string): Promise<string | null>;
  addSanction(address: string, listVersion: string): Promise<void>;

  addComplianceAlert(alert: Omit<ComplianceAlert, "id">): Promise<void>;
  listComplianceAlerts(): Promise<ComplianceAlert[]>;
  addCall(call: Omit<Call, "id">): Promise<void>;
  listCalls(): Promise<Call[]>;

  /** Resolves false when the recovery_id already exists. */
  createIdentityCheck(check: IdentityCheck): Promise<boolean>;
  getIdentityCheck(recoveryId: string): Promise<IdentityCheck | null>;
  updateIdentityCheck(recoveryId: string, patch: IdentityCheckPatch): Promise<void>;
  listIdentityChecks(): Promise<IdentityCheck[]>;

  getLastAuditHash(): Promise<string | null>;
  insertAudit(entry: Omit<AuditEntry, "id">): Promise<void>;
  listAudit(): Promise<AuditEntry[]>;
}

const newestFirst = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export class MemoryStore implements Store {
  private nonces = new Map<string, number>();
  private clients = new Map<string, Client>();
  private links: WalletLink[] = [];
  private proofs: OwnershipProof[] = [];
  private transfers: Transfer[] = [];
  private drips: GasDrip[] = [];
  private sanctions = new Map<string, string>();
  private alerts: ComplianceAlert[] = [];
  private calls: Call[] = [];
  private checks = new Map<string, IdentityCheck>();
  private audit: AuditEntry[] = [];
  private seq = 0;

  async claim(nonce: string, now: Date) {
    const t = now.getTime();
    for (const [n, at] of this.nonces) if (t - at > HMAC_NONCE_TTL_MS) this.nonces.delete(n);
    if (this.nonces.has(nonce)) return false;
    this.nonces.set(nonce, t);
    return true;
  }

  async getClient(clientId: string) { return this.clients.get(clientId) ?? null; }
  async getClientBySqRef(sqRef: string) { return [...this.clients.values()].find((c) => c.sqRef === sqRef) ?? null; }
  async listClients() { return [...this.clients.values()]; }
  async insertClientIfAbsent(client: Client) {
    if (this.clients.has(client.clientId)) return false;
    this.clients.set(client.clientId, { ...client });
    return true;
  }
  async updateClient(clientId: string, patch: ClientPatch) {
    const c = this.clients.get(clientId);
    if (c) this.clients.set(clientId, { ...c, ...patch });
  }

  async getLinkByAddress(address: string) { return this.links.find((l) => l.address === address) ?? null; }
  async getLatestLink(clientId: string) {
    return this.links.filter((l) => l.clientId === clientId).sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))[0] ?? null;
  }
  async listLinks() { return [...this.links]; }
  async addLink(link: WalletLink) { this.links.push({ ...link }); }

  async addProof(proof: Omit<OwnershipProof, "id">) { this.proofs.push({ ...proof, id: ++this.seq }); }
  async listProofs() { return newestFirst(this.proofs); }

  async addTransfer(transfer: Omit<Transfer, "id">) { this.transfers.push({ ...transfer, id: ++this.seq }); }
  async countTransfersSince(clientId: string, since: string) {
    return this.transfers.filter((t) => t.clientId === clientId && t.createdAt >= since).length;
  }

  async addGasDrip(drip: Omit<GasDrip, "id">) { this.drips.push({ ...drip, id: ++this.seq }); }
  async countGasDripsSince(since: string, address?: string) {
    return this.drips.filter((d) => d.createdAt >= since && (address === undefined || d.address === address)).length;
  }

  async getSanction(address: string) { return this.sanctions.get(address) ?? null; }
  async addSanction(address: string, listVersion: string) { this.sanctions.set(address, listVersion); }

  async addComplianceAlert(alert: Omit<ComplianceAlert, "id">) { this.alerts.push({ ...alert, id: ++this.seq }); }
  async listComplianceAlerts() { return newestFirst(this.alerts); }
  async addCall(call: Omit<Call, "id">) { this.calls.push({ ...call, id: ++this.seq }); }
  async listCalls() { return newestFirst(this.calls); }

  async createIdentityCheck(check: IdentityCheck) {
    if (this.checks.has(check.recoveryId)) return false;
    this.checks.set(check.recoveryId, { ...check });
    return true;
  }
  async getIdentityCheck(recoveryId: string) { return this.checks.get(recoveryId) ?? null; }
  async updateIdentityCheck(recoveryId: string, patch: IdentityCheckPatch) {
    const c = this.checks.get(recoveryId);
    if (c) this.checks.set(recoveryId, { ...c, ...patch });
  }
  async listIdentityChecks() { return newestFirst([...this.checks.values()]); }

  async getLastAuditHash() { return this.audit.at(-1)?.entryHash ?? null; }
  async insertAudit(entry: Omit<AuditEntry, "id">) { this.audit.push({ ...entry, id: ++this.seq }); }
  async listAudit() { return [...this.audit]; }
}
