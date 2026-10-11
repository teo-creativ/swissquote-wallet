// Hash-chained journal (table audit_log, CDC 8.7). entry_hash = SHA-256 of the canonical JSON (RFC 8785) of
// { prevHash, ts, actor, action, clientId, payload }. Changing or removing an entry breaks every hash after it.
// Payloads hold identifiers, amounts and outcomes only: never a key, a signature secret or a token.
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { Ctx } from "./ctx";
import type { Row } from "./db";

export const GENESIS_HASH = "0".repeat(64);

export function entryHash(prevHash: string, ts: string, actor: string, action: string, clientId: string | null, payload: unknown): string {
  return createHash("sha256").update(canonicalize({ prevHash, ts, actor, action, clientId, payload }) ?? "", "utf8").digest("hex");
}

// Appends are serialized inside this process. Two server instances writing at the same instant could fork the chain:
// acceptable for the prototype, and verifyChain detects it.
let tail: Promise<unknown> = Promise.resolve();

export function appendAudit(ctx: Pick<Ctx, "db" | "now">, actor: string, action: string, clientId: string | null, payload: Record<string, unknown>): Promise<void> {
  const run = tail.then(async () => {
    const last = (await ctx.db.select("audit_log", {}, { order: ["id", "desc"], limit: 1 }))[0];
    const prevHash = (last?.entry_hash as string | undefined) ?? GENESIS_HASH;
    const ts = ctx.now.toISOString();
    await ctx.db.insert("audit_log", { ts, actor, action, client_id: clientId, payload, prev_hash: prevHash, entry_hash: entryHash(prevHash, ts, actor, action, clientId, payload) });
  });
  tail = run.catch(() => undefined);
  return run;
}

/** Checks the whole chain. `firstFailure` names the first broken entry. */
export function verifyChain(entries: Row[]): { ok: boolean; checkedEntries: number; firstFailure?: string } {
  let prev = GENESIS_HASH;
  let n = 0;
  for (const e of [...entries].sort((a, b) => Number(a.id) - Number(b.id))) {
    n++;
    const ts = new Date(e.ts).toISOString();
    if (e.prev_hash !== prev || e.entry_hash !== entryHash(e.prev_hash, ts, e.actor, e.action, e.client_id ?? null, e.payload)) {
      return { ok: false, checkedEntries: n, firstFailure: `Entry ${e.id} does not match its hash.` };
    }
    prev = e.entry_hash;
  }
  return { ok: true, checkedEntries: n };
}
