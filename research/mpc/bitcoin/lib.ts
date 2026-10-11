// Bitcoin testnet4 research: a P2WPKH spend signed by two of three DKLs23 parties.
// Research only, not used by the app. Testnet only. No Taproot: ECDSA, SegWit v0.
// Key generation and signing go through the node core (../shared/mpc-node); scripts, the BIP143
// sighash and the transaction encoding come from @scure/btc-signer; DER, low S and the local
// verification come from @noble/curves. Nothing in this file prints a key share or a storage key.
import * as dkls from "@silencelaboratories/dkls-wasm-ll-node";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { SigHash, TEST_NETWORK, Transaction, p2pkh, p2wpkh } from "@scure/btc-signer";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MemorySessionStore, keygenFinish, keygenStart, keygenStep, pack, signFinish, signStart, signStep, singleKeyRing, unpack } from "../shared/mpc-node/index.ts";
import type { MpcNodeContext, StoredShare } from "../shared/mpc-node/index.ts";

export const LOCAL_DIR = join(dirname(fileURLToPath(import.meta.url)), ".local");
export const NETWORK_NAME = "Bitcoin testnet4";
// Public mempool.space API. BTC_MEMPOOL_API can point to another instance of the same software (same routes).
export const MEMPOOL_API = (process.env.BTC_MEMPOOL_API || "https://mempool.space/testnet4/api").replace(/\/+$/, "");
export const EXPLORER = "https://mempool.space/testnet4";
export const PARTY_NAMES = ["P1 client", "P2 lawyer", "P3 Swissquote"];
export const PAIRS: Array<[number, number]> = [[0, 1], [0, 2], [1, 2]];
/** Fixed fee in sats when none is given. There is no fee estimation. */
export const DEFAULT_FEE_SATS = 300n;
/** Outputs below this are refused by most nodes (dust). */
const DUST_SATS = 546n;
const KEY_VERSION = 1;

const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const fromHex = (hex: string) => new Uint8Array(Buffer.from(hex.replace(/^0x/, ""), "hex"));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Three parties and their shares. Each party has its own storage key, as a real node would. */
export type Wallet = { nodes: MpcNodeContext[]; shares: StoredShare[]; publicKey: Uint8Array; address: string };

function makeNode(partyId: number, storageKey: Uint8Array): MpcNodeContext {
  return { lib: dkls, store: new MemorySessionStore(), keys: singleKeyRing(KEY_VERSION, storageKey), partyId };
}

/** Compressed secp256k1 public key (33 bytes) -> native SegWit P2WPKH address, tb1q... */
export function addressFromPublicKey(publicKey: Uint8Array): string {
  if (publicKey.length !== 33 || (publicKey[0] !== 2 && publicKey[0] !== 3)) throw new Error("expected a 33-byte compressed public key");
  // Rejects bytes that are not a point of the curve.
  secp256k1.Point.fromBytes(publicKey);
  const address = p2wpkh(publicKey, TEST_NETWORK).address;
  if (!address || !address.startsWith("tb1q")) throw new Error("unexpected address format");
  return address;
}

/** (a) 3-party DKLs23 key generation (threshold 2) through the node core, the script playing the coordinator. */
export async function generateWallet(): Promise<Wallet> {
  const nodes = [0, 1, 2].map((id) => makeNode(id, new Uint8Array(randomBytes(32))));
  const sessionId = randomUUID();
  let messages = (await Promise.all(nodes.map((n) => keygenStart(n, { sessionId })))).flatMap((r) => r.messages);
  const r2 = await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 2, messages })));
  const commitments = r2.map((r) => r.commitment as string);
  messages = r2.flatMap((r) => r.messages);
  messages = (await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 3, messages })))).flatMap((r) => r.messages);
  messages = (await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 4, messages, commitments })))).flatMap((r) => r.messages);
  const r5 = await Promise.all(nodes.map((n) => keygenStep(n, { sessionId, round: 5, messages })));
  const publicKeyHex = r5[0].publicKey as string;
  if (!r5.every((r) => r.done && r.publicKey === publicKeyHex)) throw new Error("the three parties do not hold the same public key");
  const shares = await Promise.all(nodes.map((n) => keygenFinish(n, { sessionId, publicKey: publicKeyHex })));
  const publicKey = fromHex(publicKeyHex);
  return { nodes, shares, publicKey, address: addressFromPublicKey(publicKey) };
}

const shareFile = (id: number) => join(LOCAL_DIR, `party${id}.keyshare`);
const storageKeyFile = (id: number) => join(LOCAL_DIR, `party${id}.storage-key`);
const walletFile = join(LOCAL_DIR, "wallet.json");

export const walletExists = () => existsSync(walletFile);

// Shares are written encrypted (AES-256-GCM, node core), one storage key per party, all under
// bitcoin/.local (git-ignored). The storage keys sit next to the shares: fine for a research
// script on one machine, not a custody design.
export function saveWallet(w: Wallet): void {
  mkdirSync(LOCAL_DIR, { recursive: true });
  w.nodes.forEach((n, id) => {
    writeFileSync(shareFile(id), pack(w.shares[id].share));
    writeFileSync(storageKeyFile(id), n.keys.keys[KEY_VERSION]);
  });
  writeFileSync(walletFile, JSON.stringify({ network: NETWORK_NAME, publicKey: toHex(w.publicKey), address: w.address }, null, 2));
}

export function loadWallet(): Wallet {
  if (!walletExists()) throw new Error("no wallet found: run `npm run btc:keygen` first");
  const meta = JSON.parse(readFileSync(walletFile, "utf8")) as { publicKey: string; address: string };
  const publicKey = fromHex(meta.publicKey);
  const address = addressFromPublicKey(publicKey);
  if (address !== meta.address) throw new Error("wallet.json: the address does not match the public key");
  const nodes = [0, 1, 2].map((id) => makeNode(id, new Uint8Array(readFileSync(storageKeyFile(id)))));
  const shares = [0, 1, 2].map((id): StoredShare => ({ partyId: id, publicKey: `0x${meta.publicKey}`, share: unpack(new Uint8Array(readFileSync(shareFile(id)))) }));
  return { nodes, shares, publicKey, address };
}

/** Loads the local wallet, or creates it with a 3-party key generation when there is none. */
export async function loadOrCreateWallet(): Promise<{ wallet: Wallet; created: boolean }> {
  if (walletExists()) return { wallet: loadWallet(), created: false };
  const wallet = await generateWallet();
  saveWallet(wallet);
  return { wallet, created: true };
}

export type RawSignature = { r: Uint8Array; s: Uint8Array };

/** Two parties sign a 32-byte hash (DKLs23, rounds 1 to 6). `pair` holds key share party ids. */
export async function signWithPair(w: Wallet, pair: [number, number], hash: Uint8Array): Promise<RawSignature> {
  const signers = pair.map((id) => w.nodes[id]);
  const sessionId = randomUUID();
  let messages = (await Promise.all(signers.map((n) => signStart(n, { sessionId, share: w.shares[n.partyId], signers: pair, messageHash: hash })))).flatMap((r) => r.messages);
  for (const round of [2, 3, 4]) {
    const batch = messages;
    messages = (await Promise.all(signers.map((n) => signStep(n, { sessionId, round, messages: batch })))).flatMap((r) => r.messages);
  }
  // The first signer only emits its last message; the second one combines.
  const first = await signFinish(signers[0], { sessionId });
  const second = await signFinish(signers[1], { sessionId, peerLast: first.messages });
  if (!second.signature) throw new Error("the signing session returned no signature");
  return { r: fromHex(second.signature.r), s: fromHex(second.signature.s) };
}

export type Utxo = { txid: string; vout: number; amountSats: bigint };
export type SpendRequest = { publicKey: Uint8Array; utxo: Utxo; to: string; feeSats: bigint; sendSats?: bigint };
export type Spend = { tx: Transaction; sighash: Uint8Array; outputs: Array<{ address: string; amountSats: bigint }> };

/**
 * (c) One P2WPKH input, one output (everything minus the fee) or two (`sendSats` to `to`, the
 * change back to the wallet address). Returns the unsigned transaction and its BIP143 sighash.
 */
export function buildSpend(req: SpendRequest): Spend {
  const { utxo, feeSats } = req;
  if (!/^[0-9a-f]{64}$/.test(utxo.txid)) throw new Error("txid must be 64 lowercase hex characters");
  if (!Number.isInteger(utxo.vout) || utxo.vout < 0) throw new Error("vout must be a non-negative integer");
  if (utxo.amountSats <= 0n || feeSats <= 0n) throw new Error("amount and fee must be positive, in sats");
  const own = p2wpkh(req.publicKey, TEST_NETWORK);
  const outputs: Spend["outputs"] = [];
  if (req.sendSats === undefined) {
    outputs.push({ address: req.to, amountSats: utxo.amountSats - feeSats });
  } else {
    outputs.push({ address: req.to, amountSats: req.sendSats });
    const change = utxo.amountSats - feeSats - req.sendSats;
    if (change !== 0n) outputs.push({ address: own.address as string, amountSats: change });
  }
  for (const o of outputs) if (o.amountSats < DUST_SATS) throw new Error(`an output of ${o.amountSats} sats is below the dust limit (${DUST_SATS} sats): lower the fee or the amount sent`);

  const tx = new Transaction();
  tx.addInput({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { script: own.script, amount: utxo.amountSats } });
  // addOutputAddress rejects an address that is not valid for this network.
  for (const o of outputs) tx.addOutputAddress(o.address, o.amountSats, TEST_NETWORK);
  return { tx, sighash: sighashFor(tx, req.publicKey, utxo.amountSats), outputs };
}

// BIP143: for P2WPKH the script code is the P2PKH script of the same key hash.
function sighashFor(tx: Transaction, publicKey: Uint8Array, amountSats: bigint): Uint8Array {
  return tx.preimageWitnessV0(0, p2pkh(publicKey, TEST_NETWORK).script, SigHash.ALL, amountSats);
}

export type BtcSignature = { der: Uint8Array; wasHighS: boolean };

/**
 * [R, S] from the MPC -> low S (BIP146) -> strict DER. Throws unless the result verifies for
 * `hash` under `publicKey`.
 */
export function toBitcoinSignature(raw: RawSignature, hash: Uint8Array, publicKey: Uint8Array): BtcSignature {
  const Fn = secp256k1.Point.Fn;
  let sig = new secp256k1.Signature(BigInt(`0x${toHex(raw.r)}`), BigInt(`0x${toHex(raw.s)}`));
  const wasHighS = sig.hasHighS();
  if (wasHighS) sig = new secp256k1.Signature(sig.r, Fn.neg(sig.s));
  const der = sig.toBytes("der");
  if (!verifyDer(der, hash, publicKey)) throw new Error("the signature does not verify for the wallet public key");
  return { der, wasHighS };
}

export function verifyDer(der: Uint8Array, hash: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return secp256k1.verify(der, hash, publicKey, { prehash: false, lowS: true, format: "der" });
  } catch {
    return false;
  }
}

/** Puts the signature in the witness and returns the raw transaction. */
export function finalizeSpend(spend: Spend, publicKey: Uint8Array, sig: BtcSignature): { hex: string; txid: string; vsize: number } {
  const tx = spend.tx.clone();
  tx.updateInput(0, { partialSig: [[publicKey, new Uint8Array([...sig.der, SigHash.ALL])]] });
  tx.finalize();
  return { hex: tx.hex, txid: tx.id, vsize: tx.vsize };
}

/**
 * Decodes a raw transaction from hex, as a node would receive it, and checks it against the
 * request: same outpoint, same outputs, witness = [signature, public key], and the signature
 * verifies for the BIP143 sighash recomputed from the decoded transaction.
 */
export function checkRawTransaction(hex: string, req: SpendRequest): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const expected = buildSpend(req);
  const tx = Transaction.fromRaw(fromHex(hex));
  if (tx.inputsLength !== 1) problems.push("expected exactly one input");
  const input = tx.getInput(0);
  if (!input.txid || toHex(input.txid) !== req.utxo.txid || input.index !== req.utxo.vout) problems.push("the input does not spend the given UTXO");
  if (tx.outputsLength !== expected.outputs.length) problems.push("unexpected number of outputs");
  expected.outputs.forEach((o, i) => {
    if (i >= tx.outputsLength) return;
    if (tx.getOutputAddress(i, TEST_NETWORK) !== o.address || tx.getOutput(i).amount !== o.amountSats) problems.push(`output ${i} differs from the request`);
  });
  const witness = input.finalScriptWitness ?? [];
  if (witness.length !== 2) problems.push("the witness must hold a signature and a public key");
  else {
    const [sigWithType, pubkey] = witness;
    if (!same(pubkey, req.publicKey)) problems.push("the witness public key is not the wallet key");
    if (sigWithType[sigWithType.length - 1] !== SigHash.ALL) problems.push("the signature is not SIGHASH_ALL");
    const sighash = sighashFor(tx, req.publicKey, req.utxo.amountSats);
    if (!same(sighash, expected.sighash)) problems.push("the decoded transaction has another sighash than the one that was signed");
    if (!verifyDer(sigWithType.subarray(0, -1), sighash, req.publicKey)) problems.push("the signature does not verify for the decoded transaction");
  }
  return { ok: problems.length === 0, problems };
}

/** Minimal `--name value` and `--flag` parser. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) throw new Error(`unexpected argument: ${argv[i]}`);
    const name = argv[i].slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[name] = next;
      i++;
    } else out[name] = true;
  }
  return out;
}

export function parsePair(text: string | true | undefined): [number, number] {
  if (text === undefined) return PAIRS[0];
  const found = PAIRS.find(([a, b]) => `${a},${b}` === text || `${a}+${b}` === text);
  if (!found) throw new Error("--pair must be one of 0,1  0,2  1,2");
  return found;
}

export const pairName = ([a, b]: [number, number]) => `(${a},${b}) ${PARTY_NAMES[a]} + ${PARTY_NAMES[b]}`;

export function report(results: Array<[string, boolean]>): never {
  for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  const allOk = results.every(([, ok]) => ok);
  console.log(allOk ? "RESULT: PASS" : "RESULT: FAIL");
  process.exit(allOk ? 0 : 1);
}
