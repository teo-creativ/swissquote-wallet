// Hash-chained audit log (table audit_log). entry_hash = SHA-256 of the canonical JSON (RFC 8785) of
// { prevHash, ts, action, payload }. Changing or removing an entry breaks every hash after it.
// Payloads hold identifiers and outcomes only: never a password, a secret or share material.
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { Store } from "./store";
import type { AuditEntry } from "./types";

export const AUDIT_GENESIS_HASH = "0".repeat(64);

export function auditHash(prevHash: string, ts: string, action: string, payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalize({ prevHash, ts, action, payload }) ?? "", "utf8").digest("hex");
}

// Appends are serialized inside this process. Two server instances writing at the same instant could still fork the
// chain: acceptable for the prototype, and verifyAuditChain detects it.
let tail: Promise<unknown> = Promise.resolve();

export function appendAudit(store: Store, action: string, payload: Record<string, unknown>, now: Date): Promise<void> {
  const run = tail.then(async () => {
    const prevHash = (await store.getLastAuditHash()) ?? AUDIT_GENESIS_HASH;
    const ts = now.toISOString();
    await store.insertAudit({ ts, action, payload, prevHash, entryHash: auditHash(prevHash, ts, action, payload) });
  });
  tail = run.catch(() => undefined);
  return run;
}

/** Resolves the id of the first broken entry, or null when the chain is intact. */
export function verifyAuditChain(entries: AuditEntry[]): number | null {
  let prev = AUDIT_GENESIS_HASH;
  for (const e of entries) {
    if (e.prevHash !== prev || e.entryHash !== auditHash(e.prevHash, e.ts, e.action, e.payload)) return e.id;
    prev = e.entryHash;
  }
  return null;
}
