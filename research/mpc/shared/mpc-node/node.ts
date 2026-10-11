// MPC node core: the functions one server node (P2 lawyer, P3 Swissquote) exposes. Source of truth: /shared.
// Framework free: a route handler authenticates the caller, applies its own checks (policy, CDC 8.3),
// then calls one function per HTTP request. State lives encrypted in the SessionStore between requests.
//
// Rules enforced here (see spike/README.md, "Node rules"):
// - every step restores the session from stored bytes and never keeps it in memory;
// - the stored record of the previous round is DELETED before the round runs, so a round can never
//   run twice and a pre-signature is destroyed before lastMessage is called;
// - any failed step ends the session: there is nothing left to retry;
// - the hash to sign is fixed by the node at signStart and stored encrypted, never taken at the last step;
// - errors leave as MpcError with a stable code; no key material is logged or returned.
import { open, pack, seal, unpack } from "./crypto";
import type { KeyRing, Sealed } from "./crypto";
import { describeShare, keygenRound, keygenRound1, signLast, signRound, signRound1 } from "./protocol";
import type { SessionStore } from "./store";
import { KEYGEN_LAST_ROUND, MpcError, SIGN_PRESIGN_ROUND, fromBase64, toBase64, toHex, toMpcError } from "./types";
import type { MpcLib, WireMessage } from "./types";

export type MpcNodeContext = {
  /** The DKLs23 module: `import * as lib from "@silencelaboratories/dkls-wasm-ll-node"`. */
  lib: MpcLib;
  store: SessionStore;
  /** AES-256-GCM keys for records at rest, from the environment of this node only. */
  keys: KeyRing;
  /** 1 for the lawyer node, 2 for the Swissquote node (0 is the client, in the browser). */
  partyId: number;
};

type Kind = "dkg" | "sign";
type SessionRecord = { kind: Kind; state: string; signers?: number[]; hash?: string; publicKey?: string };

const sessionContext = (ctx: MpcNodeContext, kind: Kind, sessionId: string, round: number) => `sqkeys-session|${kind}|${ctx.partyId}|${sessionId}|${round}`;
const shareContext = (partyId: number, publicKey: string) => `sqkeys-share|${partyId}|${publicKey.toLowerCase()}`;

function checkId(sessionId: string): void {
  if (typeof sessionId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(sessionId)) throw new MpcError("BAD_REQUEST", "Invalid session id");
}

async function save(ctx: MpcNodeContext, kind: Kind, sessionId: string, round: number, record: SessionRecord): Promise<void> {
  const plain = new TextEncoder().encode(JSON.stringify(record));
  await ctx.store.put(sessionId, round, pack(seal(ctx.keys, plain, sessionContext(ctx, kind, sessionId, round))));
}

/**
 * Loads the record left by `round` and removes it from the store in the same move.
 * After this call the state exists only in the memory of this request.
 */
async function take(ctx: MpcNodeContext, kind: Kind, sessionId: string, round: number): Promise<SessionRecord> {
  const stored = await ctx.store.get(sessionId, round);
  if (!stored) throw new MpcError("SESSION_NOT_FOUND", "Session not found, expired or already used at this round");
  if (!(await ctx.store.delete(sessionId, round))) throw new MpcError("SESSION_NOT_FOUND", "Session not found, expired or already used at this round");
  const plain = open(ctx.keys, unpack(stored), sessionContext(ctx, kind, sessionId, round));
  try {
    const record = JSON.parse(new TextDecoder().decode(plain)) as SessionRecord;
    if (record.kind !== kind) throw new Error("wrong kind");
    return record;
  } catch {
    throw new MpcError("STORAGE_ERROR", "Storage error", { detail: "unreadable session record" });
  }
}

export type KeygenStepResult = { round: number; messages: WireMessage[]; commitment?: string; done?: boolean; publicKey?: `0x${string}` };

/** Key generation round 1. Creates the session and returns this node's first broadcast. */
export async function keygenStart(ctx: MpcNodeContext, input: { sessionId: string }): Promise<KeygenStepResult> {
  try {
    checkId(input.sessionId);
    if (await ctx.store.get(input.sessionId, 1)) throw new MpcError("BAD_REQUEST", "Session already started");
    const out = keygenRound1(ctx.lib, ctx.partyId);
    await save(ctx, "dkg", input.sessionId, 1, { kind: "dkg", state: toBase64(out.state as Uint8Array) });
    return { round: 1, messages: out.messages };
  } catch (err) {
    throw toMpcError(err);
  }
}

/**
 * Key generation rounds 2 to 5. `messages` may hold the whole batch of the previous round: the
 * node keeps what is addressed to it. Round 2 also returns this node's commitment; round 4 needs
 * the three commitments. After round 5 the key share waits, encrypted, for keygenFinish.
 */
export async function keygenStep(ctx: MpcNodeContext, input: { sessionId: string; round: number; messages: WireMessage[]; commitments?: string[] }): Promise<KeygenStepResult> {
  try {
    checkId(input.sessionId);
    if (!Number.isInteger(input.round) || input.round < 2 || input.round > KEYGEN_LAST_ROUND) throw new MpcError("BAD_REQUEST", "Invalid key generation round");
    const record = await take(ctx, "dkg", input.sessionId, input.round - 1);
    const out = keygenRound(ctx.lib, ctx.partyId, fromBase64(record.state), input.round, input.messages, input.commitments);
    if (out.share && out.publicKey) {
      const publicKey = toHex(out.publicKey);
      await save(ctx, "dkg", input.sessionId, input.round, { kind: "dkg", state: toBase64(out.share), publicKey });
      return { round: input.round, messages: out.messages, done: true, publicKey };
    }
    await save(ctx, "dkg", input.sessionId, input.round, { kind: "dkg", state: toBase64(out.state as Uint8Array) });
    return { round: input.round, messages: out.messages, commitment: out.commitment };
  } catch (err) {
    throw toMpcError(err);
  }
}

export type StoredShare = { partyId: number; publicKey: `0x${string}`; share: Sealed };

/**
 * Called once the coordinator has checked that all parties hold the same public key
 * (CDC annex A, dkg/commit). Returns the key share ENCRYPTED, ready for the `shares` table.
 * The session is closed whatever happens: a mismatch discards the share.
 */
export async function keygenFinish(ctx: MpcNodeContext, input: { sessionId: string; publicKey: string }): Promise<StoredShare> {
  try {
    checkId(input.sessionId);
    const record = await take(ctx, "dkg", input.sessionId, KEYGEN_LAST_ROUND);
    if (!record.publicKey || typeof input.publicKey !== "string" || record.publicKey.toLowerCase() !== input.publicKey.toLowerCase()) {
      throw new MpcError("PROTOCOL_ERROR", "Public key mismatch", { detail: "coordinator public key differs from this node's key share" });
    }
    const publicKey = record.publicKey as `0x${string}`;
    return { partyId: ctx.partyId, publicKey, share: seal(ctx.keys, fromBase64(record.state), shareContext(ctx.partyId, publicKey)) };
  } catch (err) {
    throw toMpcError(err);
  }
}

export type SignStepResult = { round: number; messages: WireMessage[]; ready?: boolean; signature?: { r: `0x${string}`; s: `0x${string}` } };

/**
 * Signing round 1. `messageHash` is the 32-byte hash THIS NODE computed from the transaction or
 * message it validated (CDC 8.3): it is stored with the session and used at the last step.
 * `signers` are key share party ids, for example [0, 1] or [1, 2].
 */
export async function signStart(ctx: MpcNodeContext, input: { sessionId: string; share: StoredShare; signers: number[]; messageHash: Uint8Array }): Promise<SignStepResult> {
  try {
    checkId(input.sessionId);
    if (!(input.messageHash instanceof Uint8Array) || input.messageHash.length !== 32) throw new MpcError("BAD_REQUEST", "The hash to sign must be 32 bytes");
    if (await ctx.store.get(input.sessionId, 1)) throw new MpcError("BAD_REQUEST", "Session already started");
    const shareBytes = open(ctx.keys, input.share.share, shareContext(ctx.partyId, input.share.publicKey));
    const out = signRound1(ctx.lib, ctx.partyId, shareBytes, input.signers);
    await save(ctx, "sign", input.sessionId, 1, { kind: "sign", state: toBase64(out.state), signers: input.signers, hash: toBase64(input.messageHash) });
    return { round: 1, messages: out.messages };
  } catch (err) {
    throw toMpcError(err);
  }
}

/** Signing rounds 2 to 4. After round 4 (`ready: true`) the stored record is a pre-signature. */
export async function signStep(ctx: MpcNodeContext, input: { sessionId: string; round: number; messages: WireMessage[] }): Promise<SignStepResult> {
  try {
    checkId(input.sessionId);
    if (!Number.isInteger(input.round) || input.round < 2 || input.round > SIGN_PRESIGN_ROUND) throw new MpcError("BAD_REQUEST", "Invalid signing round");
    const record = await take(ctx, "sign", input.sessionId, input.round - 1);
    const out = signRound(ctx.lib, ctx.partyId, record.signers as number[], fromBase64(record.state), input.round, input.messages);
    await save(ctx, "sign", input.sessionId, input.round, { ...record, state: toBase64(out.state) });
    return { round: input.round, messages: out.messages, ready: input.round === SIGN_PRESIGN_ROUND ? true : undefined };
  } catch (err) {
    throw toMpcError(err);
  }
}

/**
 * Signing round 5 (and 6). The stored pre-signature is deleted BEFORE lastMessage runs, so this
 * can succeed at most once per session. Without `peerLast` the node only returns its last
 * message (the other signer combines). With the other signer's last message it also combines
 * and returns [R, S]; the caller still has to compute yParity and check low S (CDC 3.5).
 */
export async function signFinish(ctx: MpcNodeContext, input: { sessionId: string; peerLast?: WireMessage[] }): Promise<SignStepResult> {
  try {
    checkId(input.sessionId);
    const record = await take(ctx, "sign", input.sessionId, SIGN_PRESIGN_ROUND);
    const out = signLast(ctx.lib, ctx.partyId, record.signers as number[], fromBase64(record.state), fromBase64(record.hash as string), input.peerLast);
    return { round: 5, messages: [out.message], signature: out.signature && { r: toHex(out.signature.r), s: toHex(out.signature.s) } };
  } catch (err) {
    throw toMpcError(err);
  }
}

/** Drops whatever is stored for a session (cancel, expiry, error handling). Safe to call at any time. */
export async function discardSession(ctx: MpcNodeContext, sessionId: string): Promise<void> {
  checkId(sessionId);
  for (let round = 1; round <= KEYGEN_LAST_ROUND; round++) await ctx.store.delete(sessionId, round);
}

/** Public facts of a stored share (party id, public key), for the coordinator's equality check. */
export function inspectShare(ctx: MpcNodeContext, stored: StoredShare): { partyId: number; publicKey: `0x${string}` } {
  const facts = describeShare(ctx.lib, open(ctx.keys, stored.share, shareContext(ctx.partyId, stored.publicKey)));
  return { partyId: facts.partyId, publicKey: toHex(facts.publicKey) };
}
