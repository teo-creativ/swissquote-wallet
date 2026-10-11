// MPC node core: one protocol round at a time, on serialized state. Source of truth: /shared.
// No storage, no encryption, no Node API here, so the browser party (P1) uses the same code.
// Every function restores the session from bytes, makes the library calls of ONE round,
// returns the new bytes and frees the WASM memory. Round numbers follow CDC 3.5.
import { KEYGEN_LAST_ROUND, KEYGEN_PARTICIPANTS, KEYGEN_THRESHOLD, MpcError, fromBase64, safeFree, toBase64, toMpcError } from "./types";
import type { MpcKeygenSession, MpcLib, MpcMessage, MpcSignSession, WireMessage } from "./types";

function toWire(m: MpcMessage): WireMessage {
  try {
    return { from: m.from_id, to: m.to_id ?? null, payload: toBase64(m.payload) };
  } finally {
    safeFree(m);
  }
}

/**
 * Keeps the messages of a batch that this party must handle in this round and checks them:
 * broadcast rounds take one broadcast from every other party, point-to-point rounds take
 * one message addressed to this party from every other party. Anything else is a caller error.
 */
function selectInbound(batch: WireMessage[], self: number, peers: number[], broadcast: boolean): WireMessage[] {
  if (!Array.isArray(batch)) throw new MpcError("BAD_REQUEST", "messages must be an array");
  const mine = batch.filter((m) => m && m.from !== self && (broadcast ? m.to === null || m.to === undefined : m.to === self));
  const senders = mine.map((m) => m.from).sort();
  const expected = [...peers].sort();
  if (senders.length !== expected.length || senders.some((s, i) => s !== expected[i])) {
    throw new MpcError("BAD_REQUEST", `Expected one ${broadcast ? "broadcast" : "direct"} message from each of parties ${expected.join(", ")}`);
  }
  return mine;
}

// handleMessages always consumes the Message objects it receives, on success and on failure.
function build(lib: MpcLib, batch: WireMessage[]): MpcMessage[] {
  const payloads = batch.map((m) => fromBase64(m.payload));
  return batch.map((m, i) => new lib.Message(payloads[i], m.from, m.to ?? undefined));
}

const keygenPeers = (self: number) => [...Array(KEYGEN_PARTICIPANTS).keys()].filter((id) => id !== self);

export type KeygenRound = {
  /** Serialized session to store for the next round. Null after the last round. */
  state: Uint8Array | null;
  messages: WireMessage[];
  /** Round 2 only: this party's chain code commitment (base64, 32 bytes). */
  commitment?: string;
  /** Last round only: the serialized key share (SECRET) and the compressed public key. */
  share?: Uint8Array;
  publicKey?: Uint8Array;
};

/** Key generation round 1: creates the session and its first broadcast message. */
export function keygenRound1(lib: MpcLib, partyId: number): KeygenRound {
  if (!Number.isInteger(partyId) || partyId < 0 || partyId >= KEYGEN_PARTICIPANTS) throw new MpcError("BAD_REQUEST", "Invalid party id");
  let session: MpcKeygenSession | null = null;
  try {
    session = new lib.KeygenSession(KEYGEN_PARTICIPANTS, KEYGEN_THRESHOLD, partyId);
    const messages = [toWire(session.createFirstMessage())];
    return { state: session.toBytes(), messages };
  } catch (err) {
    throw toMpcError(err);
  } finally {
    safeFree(session);
  }
}

/**
 * Key generation rounds 2 to 5.
 * Round 2: broadcasts in, direct messages and a commitment out.
 * Round 3: direct in, direct out.
 * Round 4: direct in plus `commitments` (three base64 values indexed by party id), one broadcast out.
 * Round 5: broadcasts in, key share out.
 */
export function keygenRound(lib: MpcLib, partyId: number, state: Uint8Array, round: number, inbound: WireMessage[], commitments?: string[]): KeygenRound {
  if (!Number.isInteger(round) || round < 2 || round > KEYGEN_LAST_ROUND) throw new MpcError("BAD_REQUEST", "Invalid key generation round");
  const batch = selectInbound(inbound, partyId, keygenPeers(partyId), round === 2 || round === 5);
  let commits: Uint8Array[] | undefined;
  if (round === 4) {
    if (!Array.isArray(commitments) || commitments.length !== KEYGEN_PARTICIPANTS) throw new MpcError("BAD_REQUEST", "Round 4 needs the three commitments");
    commits = commitments.map(fromBase64);
    if (commits.some((c) => c.length !== 32)) throw new MpcError("BAD_REQUEST", "A commitment must be 32 bytes");
  }

  let session: MpcKeygenSession | null = null;
  try {
    session = lib.KeygenSession.fromBytes(state);
    const out = session.handleMessages(build(lib, batch), commits).map(toWire);
    if (round === KEYGEN_LAST_ROUND) {
      // keyshare() consumes the session.
      const done = session;
      session = null;
      const share = done.keyshare();
      try {
        if (share.partyId !== partyId) throw new MpcError("PROTOCOL_ERROR", "Protocol error", { detail: "key share has an unexpected party id" });
        return { state: null, messages: out, share: share.toBytes(), publicKey: share.publicKey };
      } finally {
        safeFree(share);
      }
    }
    const commitment = round === 2 ? toBase64(session.calculateChainCodeCommitment()) : undefined;
    return { state: session.toBytes(), messages: out, commitment };
  } catch (err) {
    throw toMpcError(err);
  } finally {
    safeFree(session);
  }
}

/** Reads the public facts of a serialized key share without keeping it in WASM memory. */
export function describeShare(lib: MpcLib, shareBytes: Uint8Array): { partyId: number; publicKey: Uint8Array } {
  let share = null;
  try {
    share = lib.Keyshare.fromBytes(shareBytes);
    return { partyId: share.partyId, publicKey: share.publicKey };
  } catch (err) {
    throw toMpcError(err);
  } finally {
    safeFree(share);
  }
}

export type SignRound = { state: Uint8Array; messages: WireMessage[] };

function checkSigners(signers: number[], self: number): number {
  const ok = Array.isArray(signers) && signers.length === KEYGEN_THRESHOLD && new Set(signers).size === KEYGEN_THRESHOLD && signers.every((id) => Number.isInteger(id) && id >= 0 && id < KEYGEN_PARTICIPANTS) && signers.includes(self);
  if (!ok) throw new MpcError("BAD_REQUEST", "signers must be two distinct party ids that include this party");
  return signers.find((id) => id !== self) as number;
}

/**
 * Signing round 1: loads the key share (it is consumed by the session, so always pass fresh bytes)
 * and creates the first broadcast. Party ids are the key share ids, never renumbered.
 */
export function signRound1(lib: MpcLib, partyId: number, shareBytes: Uint8Array, signers: number[]): SignRound {
  checkSigners(signers, partyId);
  let share = null;
  let session: MpcSignSession | null = null;
  try {
    share = lib.Keyshare.fromBytes(shareBytes);
    if (share.partyId !== partyId) throw new MpcError("BAD_REQUEST", "This key share belongs to another party");
    const owned = share;
    share = null; // new SignSession() consumes the key share
    session = new lib.SignSession(owned, "m");
    const messages = [toWire(session.createFirstMessage())];
    return { state: session.toBytes(), messages };
  } catch (err) {
    throw toMpcError(err);
  } finally {
    safeFree(share);
    safeFree(session);
  }
}

/**
 * Signing rounds 2 to 4.
 * Round 2: the other signer's broadcast in, one direct message out.
 * Round 3: direct in, direct out.
 * Round 4: direct in, nothing out. The returned state is a PRE-SIGNATURE: single use.
 */
export function signRound(lib: MpcLib, partyId: number, signers: number[], state: Uint8Array, round: number, inbound: WireMessage[]): SignRound {
  if (!Number.isInteger(round) || round < 2 || round > 4) throw new MpcError("BAD_REQUEST", "Invalid signing round");
  const batch = selectInbound(inbound, partyId, [checkSigners(signers, partyId)], round === 2);
  let session: MpcSignSession | null = null;
  try {
    session = lib.SignSession.fromBytes(state);
    const messages = session.handleMessages(build(lib, batch)).map(toWire);
    return { state: session.toBytes(), messages };
  } catch (err) {
    throw toMpcError(err);
  } finally {
    safeFree(session);
  }
}

export type SignLast = { message: WireMessage; signature?: { r: Uint8Array; s: Uint8Array } };

/**
 * Signing rounds 5 and 6 on a pre-signature. THE CALLER MUST HAVE DESTROYED EVERY STORED COPY
 * OF `presignature` BEFORE CALLING THIS: the library accepts the same bytes twice, and using a
 * pre-signature for two different hashes exposes the whole key.
 * Without `peerLast` this party only emits its last message. With it, it also combines and
 * returns [R, S] (no recovery bit: see CDC 3.5 for yParity and low S).
 */
export function signLast(lib: MpcLib, partyId: number, signers: number[], presignature: Uint8Array, messageHash: Uint8Array, peerLast?: WireMessage[]): SignLast {
  if (!(messageHash instanceof Uint8Array) || messageHash.length !== 32) throw new MpcError("BAD_REQUEST", "The hash to sign must be 32 bytes");
  const batch = peerLast ? selectInbound(peerLast, partyId, [checkSigners(signers, partyId)], true) : null;
  let session: MpcSignSession | null = null;
  try {
    session = lib.SignSession.fromBytes(presignature);
    const message = toWire(session.lastMessage(messageHash));
    if (!batch) return { message };
    const live = session;
    session = null; // combine() consumes the session
    const [r, s] = live.combine(build(lib, batch)) as [Uint8Array, Uint8Array];
    return { message, signature: { r, s } };
  } catch (err) {
    throw toMpcError(err);
  } finally {
    safeFree(session);
  }
}
