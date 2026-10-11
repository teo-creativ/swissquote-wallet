// Table access of the lawyer node: the generic layer lives in /shared/db.ts, this file holds the lawyer tables' configuration.
import { MemoryDb, SupabaseDb, type Db, type DbConfig } from "@/src/shared/db";
export { DbError } from "@/src/shared/db";
export type { Cond, Db, Opts, Row, Where } from "@/src/shared/db";

/** Unique constraints of lawyer/sql/001 and 002; binary columns; tables that generate their own id. */
export const LAWYER_DB_CONFIG: DbConfig = {
  bytea: { shares: ["keyshare_enc", "nonce"], node_sessions: ["state_enc", "nonce"] },
  uuidId: ["lawyers", "lawyer_passkeys", "clients", "invitations", "webauthn_challenges", "approval_requests", "decisions", "exit_requests"],
  seqId: ["audit_log"],
  unique: {
    lawyers: [["webauthn_user_id"]],
    lawyer_passkeys: [["credential_id"]],
    clients: [["sq_ref"], ["wallet_address"]],
    invitations: [["token_hash"]],
    policies: [["client_id"]],
    recipients: [["client_id", "address"]],
    policy_versions: [["client_id", "version"]],
    shares: [["client_id", "generation"]],
    recovery_cases: [["recovery_id"]],
    audit_log: [["entry_hash"]],
    seen_nonces: [["nonce"]],
    sanctioned_addresses: [["address"]],
  },
};

export const newMemoryDb = () => new MemoryDb(LAWYER_DB_CONFIG);

const holder = globalThis as unknown as { __lawyerDb?: Db };
/** Supabase when SUPABASE_URL is set, otherwise an in-memory store (local dev: state is lost on restart). */
export function getDb(env: Record<string, string | undefined> = process.env): Db {
  if (!holder.__lawyerDb) {
    if (env.SUPABASE_URL) {
      if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
      holder.__lawyerDb = new SupabaseDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, LAWYER_DB_CONFIG);
    } else {
      holder.__lawyerDb = newMemoryDb();
    }
  }
  return holder.__lawyerDb;
}
