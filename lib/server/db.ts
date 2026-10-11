// Table access of the client app server: the generic layer lives in /shared/db.ts, this file holds the tables' configuration (sql/001 and 002).
import { MemoryDb, SupabaseDb, type Db, type DbConfig } from "@/lib/shared/db";
export { DbError } from "@/lib/shared/db";
export type { Db, Row } from "@/lib/shared/db";

export const CLIENT_DB_CONFIG: DbConfig = {
  uuidId: ["accounts", "devices", "invitations", "tx_requests", "recoveries", "alerts"],
  seqId: ["consents"],
  unique: {
    accounts: [["sq_ref"], ["wallet_address"]],
    devices: [["credential_id"]],
    invitations: [["token_hash"]],
    seen_nonces: [["nonce"]],
  },
};

export const newMemoryDb = () => new MemoryDb(CLIENT_DB_CONFIG);

const holder = globalThis as unknown as { __clientDb?: Db };
/** Supabase when SUPABASE_URL is set, otherwise an in-memory store (local dev and tests: state is lost on restart). */
export function getDb(env: Record<string, string | undefined> = process.env): Db {
  if (!holder.__clientDb) {
    if (env.SUPABASE_URL) {
      if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
      holder.__clientDb = new SupabaseDb(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, CLIENT_DB_CONFIG);
    } else {
      holder.__clientDb = newMemoryDb();
    }
  }
  return holder.__clientDb;
}
