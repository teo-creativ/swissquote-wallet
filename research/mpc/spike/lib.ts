// M0 spike helpers: stateless drivers for DKLs23 keygen and signing.
// Every round restores the session from bytes, runs one call, and serializes it back,
// which is exactly what a Vercel function node will have to do.
// Nothing in this file prints key material.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { KeygenSession, Keyshare, Message, SignSession } from "@silencelaboratories/dkls-wasm-ll-node";
import { bytesToHex, concatHex, hexToBigInt, hexToBytes, isAddressEqual, numberToHex, recoverAddress } from "viem";
import type { Address, Hex } from "viem";
import { publicKeyToAddress } from "viem/accounts";

export const SPIKE_DIR = dirname(fileURLToPath(import.meta.url));
export const LOCAL_DIR = join(SPIKE_DIR, ".local");
export const PARTICIPANTS = 3;
export const THRESHOLD = 2;
export const PARTY_NAMES = ["P1 client", "P2 lawyer", "P3 Swissquote"];

// A message as it would travel over HTTP: plain fields, no WASM pointer.
export type Wire = { from: number; to: number | undefined; payload: Uint8Array };
// Test hook: lets a negative test corrupt the messages of a given round before delivery.
export type Tamper = (round: number, wires: Wire[]) => void;

function toWire(m: Message): Wire {
  const wire = { from: m.from_id, to: m.to_id, payload: m.payload };
  m.free();
  return wire;
}

function fromWire(w: Wire): Message {
  return new Message(w.payload, w.from, w.to);
}

// Broadcast messages (no recipient) go to every party except the sender.
function broadcastsFor(wires: Wire[], id: number): Message[] {
  return wires.filter((w) => w.to === undefined && w.from !== id).map(fromWire);
}

// Point-to-point messages go only to the party named in to_id.
function directFor(wires: Wire[], id: number): Message[] {
  return wires.filter((w) => w.to === id).map(fromWire);
}

type Session = { toBytes(): Uint8Array; free(): void };

// Restore a session from bytes, run one call on it, serialize it back, free the WASM memory.
function step<S extends Session, T>(restore: (b: Uint8Array) => S, state: Uint8Array[], i: number, fn: (s: S) => T): T {
  const session = restore(state[i]);
  let out: T;
  try {
    out = fn(session);
    state[i] = session.toBytes();
  } catch (err) {
    // After some protocol errors free() itself throws; never let that hide the real error (banParty).
    try {
      session.free();
    } catch {
      // The session is unusable either way.
    }
    throw err;
  }
  session.free();
  return out;
}

export type KeygenResult = { shares: Uint8Array[]; publicKey: Uint8Array };

// Three-party DKG, stateless between every round. Returns serialized key shares.
export function keygen(): KeygenResult {
  const ids = [...Array(PARTICIPANTS).keys()];
  const restore = (b: Uint8Array) => KeygenSession.fromBytes(b);
  const state = ids.map((id) => {
    const s = new KeygenSession(PARTICIPANTS, THRESHOLD, id);
    const bytes = s.toBytes();
    s.free();
    return bytes;
  });
  const run = <T>(i: number, fn: (s: KeygenSession) => T) => step(restore, state, i, fn);

  // Round 1: one broadcast per party.
  const msg1 = ids.map((i) => toWire(run(i, (s) => s.createFirstMessage())));
  // Round 2: handle broadcasts, produce point-to-point messages.
  const msg2 = ids.flatMap((i) => run(i, (s) => s.handleMessages(broadcastsFor(msg1, i))).map(toWire));
  // Chain code commitments: one 32-byte value per party, indexed by party id.
  const commitments = ids.map((i) => run(i, (s) => s.calculateChainCodeCommitment()));
  // Round 3: point-to-point in, point-to-point out.
  const msg3 = ids.flatMap((i) => run(i, (s) => s.handleMessages(directFor(msg2, i))).map(toWire));
  // Round 4: point-to-point in plus the commitments array, one broadcast out.
  const msg4 = ids.flatMap((i) => run(i, (s) => s.handleMessages(directFor(msg3, i), commitments)).map(toWire));
  // Round 5: handle the last broadcasts, nothing comes out.
  for (const i of ids) run(i, (s) => s.handleMessages(broadcastsFor(msg4, i)).forEach((m) => m.free()));

  // keyshare() consumes the session, so no free() on it afterwards.
  const shares: Uint8Array[] = [];
  const publicKeys: Uint8Array[] = [];
  for (const i of ids) {
    const share = KeygenSession.fromBytes(state[i]).keyshare();
    if (share.partyId !== i) throw new Error(`party ${i}: unexpected keyshare.partyId ${share.partyId}`);
    publicKeys.push(share.publicKey);
    shares.push(share.toBytes());
    share.free();
  }
  const first = bytesToHex(publicKeys[0]);
  if (!publicKeys.every((pk) => bytesToHex(pk) === first)) throw new Error("parties disagree on the public key");
  return { shares, publicKey: publicKeys[0] };
}

// Compressed 33-byte MPC public key -> ordinary Ethereum address (EOA).
export function addressFromPublicKey(publicKey: Uint8Array): Address {
  const uncompressed = secp256k1.Point.fromBytes(publicKey).toBytes(false);
  return publicKeyToAddress(bytesToHex(uncompressed));
}

export type Presignature = { state: Uint8Array[]; signIds: number[] };

// Rounds 1 to 4 of DSG for one pair of key shares. The result is a pre-signature per party.
// A pre-signature must be used once and then destroyed.
export function presign(shares: Uint8Array[], tamper?: Tamper): Presignature {
  const idx = shares.map((_, i) => i);
  const restore = (b: Uint8Array) => SignSession.fromBytes(b);
  // new SignSession() consumes the keyshare object, so it is reloaded from bytes every time.
  const state = shares.map((bytes) => {
    const s = new SignSession(Keyshare.fromBytes(bytes), "m");
    const out = s.toBytes();
    s.free();
    return out;
  });
  const run = <T>(i: number, fn: (s: SignSession) => T) => step(restore, state, i, fn);

  const msg1 = idx.map((i) => toWire(run(i, (s) => s.createFirstMessage())));
  // The id a party uses during signing is whatever it puts in from_id of its first message.
  const signIds = msg1.map((w) => w.from);
  tamper?.(1, msg1);
  const msg2 = idx.flatMap((i) => run(i, (s) => s.handleMessages(broadcastsFor(msg1, signIds[i]))).map(toWire));
  tamper?.(2, msg2);
  const msg3 = idx.flatMap((i) => run(i, (s) => s.handleMessages(directFor(msg2, signIds[i]))).map(toWire));
  tamper?.(3, msg3);
  for (const i of idx) run(i, (s) => s.handleMessages(directFor(msg3, signIds[i])).forEach((m) => m.free()));
  return { state, signIds };
}

export type RawSignature = { r: Uint8Array; s: Uint8Array };

// Rounds 5 and 6: bind the pre-signature to a 32-byte hash and combine.
// The session is kept in memory between lastMessage and combine and is never serialized again.
export function finish(pre: Presignature, hash: Uint8Array, tamper?: Tamper): RawSignature[] {
  const sessions = pre.state.map((b) => SignSession.fromBytes(b));
  let live = [...sessions];
  try {
    const last = sessions.map((s) => toWire(s.lastMessage(hash)));
    tamper?.(5, last);
    return sessions.map((s, i) => {
      // combine() consumes the session.
      live = live.filter((x) => x !== s);
      const [r, sig] = s.combine(broadcastsFor(last, pre.signIds[i])) as [Uint8Array, Uint8Array];
      return { r, s: sig };
    });
  } finally {
    for (const s of live) s.free();
  }
}

export function signPair(shares: Uint8Array[], hash: Uint8Array): { signIds: number[]; signatures: RawSignature[] } {
  const pre = presign(shares);
  return { signIds: pre.signIds, signatures: finish(pre, hash) };
}

export type EthSignature = { r: Hex; s: Hex; yParity: 0 | 1; wasHighS: boolean };

// [R, S] has no recovery bit: normalise S to the low half, then try yParity 0 and 1.
// Returns null when neither value recovers the expected address (invalid signature).
export async function toEthSignature(raw: RawSignature, hash: Hex, expected: Address): Promise<EthSignature | null> {
  const Fn = secp256k1.Point.Fn;
  const r = bytesToHex(raw.r, { size: 32 });
  let sValue = hexToBigInt(bytesToHex(raw.s));
  const wasHighS = sValue > Fn.ORDER >> 1n;
  if (wasHighS) sValue = Fn.neg(sValue);
  const s = numberToHex(sValue, { size: 32 });
  for (const yParity of [0, 1] as const) {
    try {
      const recovered = await recoverAddress({ hash, signature: { r, s, yParity } });
      if (isAddressEqual(recovered, expected)) return { r, s, yParity, wasHighS };
    } catch {
      // Not a recoverable point for this parity: try the other one.
    }
  }
  return null;
}

// Independent check with @noble/curves against the MPC public key (no address recovery involved).
export function verifyWithPublicKey(sig: EthSignature, hash: Hex, publicKey: Uint8Array): boolean {
  const compact = hexToBytes(concatHex([sig.r, sig.s]));
  return secp256k1.verify(compact, hexToBytes(hash), publicKey, { prehash: false, lowS: true });
}

const shareFile = (id: number) => join(LOCAL_DIR, `party${id}.keyshare`);
const walletFile = join(LOCAL_DIR, "wallet.json");

// Key shares are written to spike/.local only (git-ignored) and never printed.
export function saveWallet(result: KeygenResult): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  result.shares.forEach((bytes, id) => writeFileSync(shareFile(id), bytes));
  const wallet = { publicKey: bytesToHex(result.publicKey), address: addressFromPublicKey(result.publicKey) };
  writeFileSync(walletFile, JSON.stringify(wallet, null, 2));
}

export function loadShare(id: number): Uint8Array {
  if (!existsSync(shareFile(id))) throw new Error("no key share found: run s1.ts first");
  return new Uint8Array(readFileSync(shareFile(id)));
}

export function loadWallet(): { publicKey: Hex; address: Address } {
  if (!existsSync(walletFile)) throw new Error("no wallet found: run s1.ts first");
  return JSON.parse(readFileSync(walletFile, "utf8"));
}

// Read one variable from a dotenv-style file without printing it.
export function readEnvValue(file: string, name: string): string | undefined {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match || match[1] !== name) continue;
    const value = match[2].replace(/\s+#.*$/, "").trim().replace(/^["']|["']$/g, "");
    return value || undefined;
  }
  return undefined;
}

export function report(results: Array<[string, boolean]>): never {
  for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  const allOk = results.every(([, ok]) => ok);
  console.log(allOk ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(allOk ? 0 : 1);
}
