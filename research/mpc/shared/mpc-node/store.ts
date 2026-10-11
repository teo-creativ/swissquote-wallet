// MPC node core: where a node keeps its session state between two HTTP requests. Source of truth: /shared.
// The store only ever sees encrypted bytes (see crypto.ts).

/**
 * Encrypted session records keyed by session id and round. A session has at most one live
 * record: the state left by the last completed round.
 * A database implementation maps to `node_sessions` (CDC annex B) and must also expire rows.
 */
export interface SessionStore {
  put(sessionId: string, round: number, record: Uint8Array): Promise<void>;
  get(sessionId: string, round: number): Promise<Uint8Array | null>;
  /**
   * Removes the record. MUST be atomic and resolve true only for the one caller that actually
   * removed it (SQL: `delete ... returning`). The single-use rule of pre-signatures relies on it.
   */
  delete(sessionId: string, round: number): Promise<boolean>;
}

/** In-memory store for tests and local harnesses. Records expire after `ttlMs` (CDC 3.5: 10 minutes). */
export class MemorySessionStore implements SessionStore {
  private records = new Map<string, { record: Uint8Array; expiresAt: number }>();
  constructor(
    private ttlMs = 10 * 60_000,
    private now: () => number = Date.now,
  ) {}

  private key(sessionId: string, round: number): string {
    return `${sessionId}#${round}`;
  }

  async put(sessionId: string, round: number, record: Uint8Array): Promise<void> {
    this.records.set(this.key(sessionId, round), { record: record.slice(), expiresAt: this.now() + this.ttlMs });
  }

  async get(sessionId: string, round: number): Promise<Uint8Array | null> {
    const entry = this.records.get(this.key(sessionId, round));
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.records.delete(this.key(sessionId, round));
      return null;
    }
    return entry.record.slice();
  }

  async delete(sessionId: string, round: number): Promise<boolean> {
    return this.records.delete(this.key(sessionId, round));
  }

  /** Number of live records (tests). */
  get size(): number {
    return this.records.size;
  }
}
