// Three nodes run a real DKLs23 key generation and signatures in memory, through the same
// functions the HTTP routes call. No network: the test plays the coordinator.
import * as dkls from "@silencelaboratories/dkls-wasm-ll-node";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { open, pack, seal, singleKeyRing, unpack } from "./crypto";
import { keygenFinish, keygenStart, keygenStep, signFinish, signStart, signStep } from "./node";
import type { MpcNodeContext, StoredShare } from "./node";
import { MemorySessionStore } from "./store";
import type { SessionStore } from "./store";
import { MpcError, fromBase64, toBase64 } from "./types";
import type { MpcLib, WireMessage } from "./types";

const lib: MpcLib = dkls;
const IDS = [0, 1, 2];

function makeNode(partyId: number, store: SessionStore = new MemorySessionStore(), mpcLib: MpcLib = lib): MpcNodeContext {
  // Every node has its own random storage key, as in production.
  return { lib: mpcLib, store, keys: singleKeyRing(1, new Uint8Array(randomBytes(32))), partyId };
}

const hexToBytes = (hex: string) => new Uint8Array(Buffer.from(hex.slice(2), "hex"));
const newId = () => crypto.randomUUID();

async function runKeygen(nodes: MpcNodeContext[]): Promise<StoredShare[]> {
  const sessionId = newId();
  let msgs = (await Promise.all(nodes.map((n) => keygenStart(n, { sessionId })))).flatMap((r) => r.messages);
  const r2 = await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 2, messages: msgs })));
  const commitments = r2.map((r) => r.commitment as string);
  msgs = r2.flatMap((r) => r.messages);
  msgs = (await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 3, messages: msgs })))).flatMap((r) => r.messages);
  msgs = (await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 4, messages: msgs, commitments })))).flatMap((r) => r.messages);
  const r5 = await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 5, messages: msgs })));
  expect(r5.every((r) => r.done && r.publicKey === r5[0].publicKey)).toBe(true);
  return Promise.all(nodes.map((n) => keygenFinish(n, { sessionId, publicKey: r5[0].publicKey as string })));
}

type Hook = (round: number, msgs: WireMessage[]) => WireMessage[];

// Runs rounds 1 to 4 for two signers and returns the session id (both hold a pre-signature).
async function runPresign(signers: MpcNodeContext[], shares: StoredShare[], hash: Uint8Array, hook: Hook = (_r, m) => m): Promise<string> {
  const sessionId = newId();
  const ids = signers.map((n) => n.partyId);
  let msgs = (await Promise.all(signers.map((n) => signStart(n, { sessionId, share: shares[n.partyId], signers: ids, messageHash: hash })))).flatMap((r) => r.messages);
  for (const round of [2, 3, 4]) {
    const batch = hook(round - 1, msgs);
    const out = [];
    // Sequential on purpose: the tests assert which node rejects a message.
    for (const n of signers) out.push(await signStep(n, { sessionId, round, messages: batch }));
    msgs = out.flatMap((r) => r.messages);
    if (round === 4) expect(out.every((r) => r.ready)).toBe(true);
  }
  return sessionId;
}

async function runSign(signers: MpcNodeContext[], shares: StoredShare[], hash: Uint8Array) {
  const sessionId = await runPresign(signers, shares, hash);
  // The first signer only emits its last message; the second one combines.
  const first = await signFinish(signers[0], { sessionId });
  expect(first.signature).toBeUndefined();
  const second = await signFinish(signers[1], { sessionId, peerLast: first.messages });
  return { sessionId, signature: second.signature as { r: `0x${string}`; s: `0x${string}` } };
}

function verifies(signature: { r: string; s: string }, hash: Uint8Array, publicKey: string): boolean {
  const compact = new Uint8Array([...hexToBytes(signature.r), ...hexToBytes(signature.s)]);
  return secp256k1.verify(compact, hash, hexToBytes(publicKey), { prehash: false, lowS: false });
}

// Flips one bit. Default: the last byte, which the library always reports as a cheating party.
// A flip elsewhere is detected too, but about half of the time as a decoding error (no banParty).
function flipByte(m: WireMessage, at?: (length: number) => number): WireMessage {
  const bytes = fromBase64(m.payload);
  bytes[at ? at(bytes.length) : bytes.length - 1] ^= 0x01;
  return { ...m, payload: toBase64(bytes) };
}

async function codeOf(p: Promise<unknown>): Promise<MpcError> {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(MpcError);
  return err as MpcError;
}

describe("mpc-node", () => {
  const nodes = IDS.map((id) => makeNode(id));
  const stores = nodes.map((n) => n.store as MemorySessionStore);
  let shares: StoredShare[] = [];
  const hash = new Uint8Array(randomBytes(32));

  beforeAll(async () => {
    shares = await runKeygen(nodes);
  }, 60_000);

  it("keygen: three nodes end with the same public key and an encrypted share each", () => {
    expect(shares.map((s) => s.partyId)).toEqual(IDS);
    expect(new Set(shares.map((s) => s.publicKey)).size).toBe(1);
    expect(shares[0].publicKey).toMatch(/^0x0[23][0-9a-f]{64}$/);
    for (const s of shares) expect(s.share.keyVersion).toBe(1);
    // Nothing is left in any store once the shares are handed over.
    expect(stores.map((s) => s.size)).toEqual([0, 0, 0]);
  });

  it("keygen: a share can only be opened by the node that owns it", () => {
    expect(() => open(nodes[2].keys, shares[1].share, `sqkeys-share|1|${shares[1].publicKey}`)).toThrow(MpcError);
    expect(open(nodes[1].keys, shares[1].share, `sqkeys-share|1|${shares[1].publicKey}`).length).toBeGreaterThan(0);
  });

  it("sign: (P1, P2) produce a signature that verifies for the wallet public key", async () => {
    const { signature } = await runSign([nodes[0], nodes[1]], shares, hash);
    expect(verifies(signature, hash, shares[0].publicKey)).toBe(true);
    expect(verifies(signature, new Uint8Array(randomBytes(32)), shares[0].publicKey)).toBe(false);
    expect(stores.map((s) => s.size)).toEqual([0, 0, 0]);
  });

  it("sign: (P2, P3) and (P1, P3) also work with their own party ids", async () => {
    for (const pair of [[1, 2], [0, 2]]) {
      const { signature } = await runSign(pair.map((id) => nodes[id]), shares, hash);
      expect(verifies(signature, hash, shares[0].publicKey)).toBe(true);
    }
  });

  it("single use: the stored pre-signature is deleted before lastMessage is called", async () => {
    const events: string[] = [];
    const inner = new MemorySessionStore();
    const spyStore: SessionStore = {
      put: (id, round, record) => inner.put(id, round, record),
      get: (id, round) => inner.get(id, round),
      delete: async (id, round) => {
        const removed = await inner.delete(id, round);
        events.push(`delete:${round}:${removed}`);
        return removed;
      },
    };
    // Same library, but lastMessage reports when it runs and what the store holds at that moment.
    const spyLib: MpcLib = {
      ...lib,
      SignSession: Object.assign(function () {} as unknown as MpcLib["SignSession"], {
        fromBytes(bytes: Uint8Array) {
          const session = lib.SignSession.fromBytes(bytes);
          const original = session.lastMessage.bind(session);
          session.lastMessage = (h: Uint8Array) => {
            events.push(`lastMessage:stored=${inner.size}`);
            return original(h);
          };
          return session;
        },
      }),
    };
    const p2 = { ...nodes[1], store: spyStore };
    const sessionId = await runPresign([nodes[0], p2], shares, hash);
    events.length = 0;
    await signFinish({ ...p2, lib: spyLib }, { sessionId });
    expect(events).toEqual(["delete:4:true", "lastMessage:stored=0"]);

    // A second finish finds nothing: the pre-signature cannot be used twice.
    expect((await codeOf(signFinish(p2, { sessionId }))).code).toBe("SESSION_NOT_FOUND");
  });

  it("single use: if the delete is lost to another request, lastMessage never runs", async () => {
    const inner = new MemorySessionStore();
    let lastMessageCalls = 0;
    const racingStore: SessionStore = { put: (i, r, b) => inner.put(i, r, b), get: (i, r) => inner.get(i, r), delete: async (i, r) => (r === 4 ? false : inner.delete(i, r)) };
    const countingLib: MpcLib = {
      ...lib,
      SignSession: Object.assign(function () {} as unknown as MpcLib["SignSession"], {
        fromBytes(bytes: Uint8Array) {
          lastMessageCalls++;
          return lib.SignSession.fromBytes(bytes);
        },
      }),
    };
    const p2 = { ...nodes[1], store: racingStore };
    const sessionId = await runPresign([nodes[0], p2], shares, hash);
    lastMessageCalls = 0;
    expect((await codeOf(signFinish({ ...p2, lib: countingLib }, { sessionId }))).code).toBe("SESSION_NOT_FOUND");
    expect(lastMessageCalls).toBe(0);
  });

  it("replay: a round cannot be run twice", async () => {
    const sessionId = newId();
    const ids = [0, 1];
    const first = await Promise.all(ids.map((id) => signStart(nodes[id], { sessionId, share: shares[id], signers: ids, messageHash: hash })));
    const msgs = first.flatMap((r) => r.messages);
    await signStep(nodes[1], { sessionId, round: 2, messages: msgs });
    expect((await codeOf(signStep(nodes[1], { sessionId, round: 2, messages: msgs }))).code).toBe("SESSION_NOT_FOUND");
    // Skipping ahead is refused too.
    expect((await codeOf(signStep(nodes[0], { sessionId, round: 3, messages: msgs }))).code).toBe("SESSION_NOT_FOUND");
  });

  it("tampering: a modified message aborts with ABORT_BAN_PARTY and names the sender", async () => {
    // Party 0 sends a corrupted round 2 message; party 1 detects it in round 3.
    const err = await codeOf(runPresign([nodes[0], nodes[1]], shares, hash, (round, msgs) => (round === 2 ? msgs.map((m) => (m.from === 0 ? flipByte(m) : m)) : msgs)));
    expect(err.code).toBe("ABORT_BAN_PARTY");
    expect(err.banParty).toBe(0);

    // Same with the Swissquote node as the cheater: the id is the key share id, not an index.
    const err2 = await codeOf(runPresign([nodes[1], nodes[2]], shares, hash, (round, msgs) => (round === 2 ? msgs.map((m) => (m.from === 2 ? flipByte(m) : m)) : msgs)));
    expect(err2.code).toBe("ABORT_BAN_PARTY");
    expect(err2.banParty).toBe(2);
  });

  it("tampering: a flipped bit anywhere is always rejected, with one of the two protocol codes", async () => {
    for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const at = (length: number) => Math.floor(length * fraction);
      const err = await codeOf(runPresign([nodes[0], nodes[1]], shares, hash, (round, msgs) => (round === 2 ? msgs.map((m) => (m.from === 0 ? flipByte(m, at) : m)) : msgs)));
      expect(["ABORT_BAN_PARTY", "PROTOCOL_ERROR"]).toContain(err.code);
      if (err.code === "ABORT_BAN_PARTY") expect(err.banParty).toBe(0);
    }
  });

  it("tampering: garbage is a PROTOCOL_ERROR and the session is gone afterwards", async () => {
    const sessionId = newId();
    const ids = [0, 1];
    const first = await Promise.all(ids.map((id) => signStart(nodes[id], { sessionId, share: shares[id], signers: ids, messageHash: hash })));
    const garbage = first.flatMap((r) => r.messages).map((m) => ({ ...m, payload: toBase64(new Uint8Array(40)) }));
    const err = await codeOf(signStep(nodes[1], { sessionId, round: 2, messages: garbage }));
    expect(err.code).toBe("PROTOCOL_ERROR");
    expect(err.banParty).toBeUndefined();
    expect(err.message).toBe("Protocol error");
    // No retry with the good messages: the failed step consumed the session.
    expect((await codeOf(signStep(nodes[1], { sessionId, round: 2, messages: first.flatMap((r) => r.messages) }))).code).toBe("SESSION_NOT_FOUND");
  });

  it("tampering: a modified last message never yields a signature", async () => {
    const sessionId = await runPresign([nodes[1], nodes[2]], shares, hash);
    const first = await signFinish(nodes[1], { sessionId });
    const err = await codeOf(signFinish(nodes[2], { sessionId, peerLast: first.messages.map((m) => flipByte(m)) }));
    expect(["PROTOCOL_ERROR", "ABORT_BAN_PARTY"]).toContain(err.code);
  });

  it("input checks: wrong senders, wrong rounds and foreign shares are BAD_REQUEST", async () => {
    const sessionId = newId();
    const ids = [0, 1];
    const first = await Promise.all(ids.map((id) => signStart(nodes[id], { sessionId, share: shares[id], signers: ids, messageHash: hash })));
    const fromStranger = first.flatMap((r) => r.messages).map((m) => ({ ...m, from: 2 }));
    expect((await codeOf(signStep(nodes[1], { sessionId, round: 2, messages: fromStranger }))).code).toBe("BAD_REQUEST");
    expect((await codeOf(signStep(nodes[0], { sessionId, round: 7, messages: [] }))).code).toBe("BAD_REQUEST");
    expect((await codeOf(signStart(nodes[1], { sessionId: newId(), share: shares[1], signers: [0, 2], messageHash: hash }))).code).toBe("BAD_REQUEST");
    expect((await codeOf(signStart(nodes[1], { sessionId: newId(), share: shares[1], signers: [1, 2], messageHash: new Uint8Array(31) }))).code).toBe("BAD_REQUEST");
    // Node 2 cannot open the share of node 1 (different storage key).
    expect((await codeOf(signStart(nodes[2], { sessionId: newId(), share: { ...shares[1], partyId: 2 }, signers: [1, 2], messageHash: hash }))).code).toBe("STORAGE_ERROR");
  });

  it("keygen: a public key mismatch at finish discards the share", async () => {
    const fresh = IDS.map((id) => makeNode(id));
    const sessionId = newId();
    let msgs = (await Promise.all(fresh.map((n) => keygenStart(n, { sessionId })))).flatMap((r) => r.messages);
    const r2 = await Promise.all(fresh.map((n) => keygenStep(n, { sessionId, round: 2, messages: msgs })));
    msgs = r2.flatMap((r) => r.messages);
    msgs = (await Promise.all(fresh.map((n) => keygenStep(n, { sessionId, round: 3, messages: msgs })))).flatMap((r) => r.messages);
    msgs = (await Promise.all(fresh.map((n) => keygenStep(n, { sessionId, round: 4, messages: msgs, commitments: r2.map((r) => r.commitment as string) })))).flatMap((r) => r.messages);
    const r5 = await Promise.all(fresh.map((n) => keygenStep(n, { sessionId, round: 5, messages: msgs })));
    const err = await codeOf(keygenFinish(fresh[1], { sessionId, publicKey: shares[0].publicKey }));
    expect(err.code).toBe("PROTOCOL_ERROR");
    expect((await codeOf(keygenFinish(fresh[1], { sessionId, publicKey: r5[1].publicKey as string }))).code).toBe("SESSION_NOT_FOUND");
  }, 60_000);

  it("storage: session records are encrypted and bound to their session and round", async () => {
    const store = new MemorySessionStore();
    const node = makeNode(1, store);
    const sessionId = newId();
    await keygenStart(node, { sessionId });
    const record = (await store.get(sessionId, 1)) as Uint8Array;
    expect(Buffer.from(record).toString("latin1")).not.toContain('"kind"');
    // Moving the record to another session id makes it unreadable.
    const other = newId();
    await store.put(other, 1, record);
    expect((await codeOf(keygenStep(node, { sessionId: other, round: 2, messages: [] }))).code).toBe("STORAGE_ERROR");
  });
});

describe("mpc-node crypto", () => {
  const ring = singleKeyRing(3, new Uint8Array(randomBytes(32)));
  const data = new Uint8Array(randomBytes(200));

  it("round trips and carries the key version", () => {
    const sealed = seal(ring, data, "ctx");
    expect(sealed.keyVersion).toBe(3);
    expect(sealed.nonce.length).toBe(12);
    expect(open(ring, sealed, "ctx")).toEqual(data);
    expect(open(ring, unpack(pack(sealed)), "ctx")).toEqual(data);
    expect(unpack(pack(sealed)).keyVersion).toBe(3);
  });

  it("uses a fresh nonce for every record", () => {
    expect(Buffer.from(seal(ring, data, "ctx").nonce).equals(Buffer.from(seal(ring, data, "ctx").nonce))).toBe(false);
  });

  it("rejects a wrong context, modified bytes, a wrong key and an unknown key version", () => {
    const sealed = seal(ring, data, "ctx");
    expect(() => open(ring, sealed, "other")).toThrow(MpcError);
    const modified = { ...sealed, ciphertext: sealed.ciphertext.slice() };
    modified.ciphertext[0] ^= 1;
    expect(() => open(ring, modified, "ctx")).toThrow(MpcError);
    expect(() => open(singleKeyRing(3, new Uint8Array(randomBytes(32))), sealed, "ctx")).toThrow(MpcError);
    expect(() => open(singleKeyRing(4, ring.keys[3]), sealed, "ctx")).toThrow(MpcError);
  });

  it("keeps old key versions readable after a rotation", () => {
    const sealed = seal(ring, data, "ctx");
    const rotated = { current: 4, keys: { 3: ring.keys[3], 4: new Uint8Array(randomBytes(32)) } };
    expect(open(rotated, sealed, "ctx")).toEqual(data);
    expect(seal(rotated, data, "ctx").keyVersion).toBe(4);
  });

  it("refuses keys that are not 32 bytes", () => {
    expect(() => singleKeyRing(1, new Uint8Array(16))).toThrow();
  });
});
