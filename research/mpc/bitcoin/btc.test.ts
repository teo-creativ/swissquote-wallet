// Bitcoin research: the path "external signature -> low S -> DER -> witness" gives a valid P2WPKH
// spend, first with an ordinary key (compared byte for byte with the library's own signer), then
// with every pair of a real 3-party DKLs23 wallet. No network, fake UTXO.
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { TEST_NETWORK, Transaction, p2wpkh } from "@scure/btc-signer";
import { beforeAll, describe, expect, it } from "vitest";
import { PAIRS, addressFromPublicKey, buildSpend, checkRawTransaction, finalizeSpend, generateWallet, parsePair, signWithPair, toBitcoinSignature, verifyDer } from "./lib.ts";
import type { RawSignature, SpendRequest, Wallet } from "./lib.ts";

const utxo = { txid: "cd".repeat(32), vout: 1, amountSats: 50_000n };
const split = (compact: Uint8Array): RawSignature => ({ r: compact.subarray(0, 32), s: compact.subarray(32) });

describe("bitcoin P2WPKH spend with an external signer", () => {
  const secretKey = secp256k1.utils.randomSecretKey();
  const publicKey = secp256k1.getPublicKey(secretKey, true);
  const address = addressFromPublicKey(publicKey);
  const req: SpendRequest = { publicKey, utxo, to: address, feeSats: 300n, sendSats: 20_000n };
  const sign = (hash: Uint8Array) => secp256k1.sign(hash, secretKey, { prehash: false });

  it("derives a tb1q address from a compressed key and refuses anything else", () => {
    expect(address).toMatch(/^tb1q[0-9a-z]{38}$/);
    expect(address).toBe(p2wpkh(publicKey, TEST_NETWORK).address);
    expect(() => addressFromPublicKey(secp256k1.getPublicKey(secretKey, false))).toThrow();
    // x above the field prime: not a point of the curve.
    expect(() => addressFromPublicKey(new Uint8Array([2, ...new Uint8Array(32).fill(0xff)]))).toThrow();
  });

  it("gives the same raw transaction as the library's own signer", () => {
    const spend = buildSpend(req);
    expect(spend.outputs.map((o) => o.amountSats)).toEqual([20_000n, 29_700n]);
    const ours = finalizeSpend(spend, publicKey, toBitcoinSignature(split(sign(spend.sighash)), spend.sighash, publicKey));

    const reference = spend.tx.clone();
    reference.sign(secretKey);
    reference.finalize();
    expect(ours.hex).toBe(reference.hex);
    expect(ours.txid).toBe(reference.id);
    expect(checkRawTransaction(ours.hex, req)).toEqual({ ok: true, problems: [] });
  });

  it("normalises a high S signature and still verifies", () => {
    const hash = buildSpend(req).sighash;
    const low = secp256k1.Signature.fromBytes(sign(hash));
    const high = new secp256k1.Signature(low.r, secp256k1.Point.Fn.neg(low.s));
    expect(high.hasHighS()).toBe(true);
    const out = toBitcoinSignature(split(high.toBytes("compact")), hash, publicKey);
    expect(out.wasHighS).toBe(true);
    expect(secp256k1.Signature.fromBytes(out.der, "der").hasHighS()).toBe(false);
    expect(verifyDer(out.der, hash, publicKey)).toBe(true);
  });

  it("rejects a signature for another hash, and a raw transaction checked against another request", () => {
    const spend = buildSpend(req);
    expect(() => toBitcoinSignature(split(sign(new Uint8Array(32).fill(7))), spend.sighash, publicKey)).toThrow();
    const raw = finalizeSpend(spend, publicKey, toBitcoinSignature(split(sign(spend.sighash)), spend.sighash, publicKey));
    // The sighash commits to the amount of the UTXO.
    expect(checkRawTransaction(raw.hex, { ...req, utxo: { ...utxo, amountSats: 50_001n }, sendSats: 20_001n }).ok).toBe(false);
    expect(checkRawTransaction(raw.hex, { ...req, feeSats: 301n }).ok).toBe(false);
  });

  it("refuses dust outputs and malformed input", () => {
    expect(() => buildSpend({ ...req, sendSats: 100n })).toThrow(/dust/);
    expect(() => buildSpend({ ...req, sendSats: undefined, feeSats: 49_900n })).toThrow(/dust/);
    expect(() => buildSpend({ ...req, utxo: { ...utxo, txid: "xyz" } })).toThrow();
    // A mainnet address must be refused.
    expect(() => buildSpend({ ...req, to: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4" })).toThrow();
    expect(() => parsePair("1,1")).toThrow();
    expect(parsePair("0,2")).toEqual([0, 2]);
  });
});

describe("bitcoin P2WPKH spend signed by two of three DKLs23 parties", () => {
  let wallet: Wallet;
  beforeAll(async () => {
    wallet = await generateWallet();
  }, 60_000);

  it("keygen gives one compressed public key and a tb1q address", () => {
    expect(wallet.publicKey.length).toBe(33);
    expect(new Set(wallet.shares.map((s) => s.publicKey)).size).toBe(1);
    expect(wallet.address).toMatch(/^tb1q/);
  });

  it("every pair produces a valid raw transaction for the same spend", async () => {
    const req: SpendRequest = { publicKey: wallet.publicKey, utxo, to: wallet.address, feeSats: 300n };
    const spend = buildSpend(req);
    const txids = new Set<string>();
    for (const pair of PAIRS) {
      const sig = toBitcoinSignature(await signWithPair(wallet, pair, spend.sighash), spend.sighash, wallet.publicKey);
      const raw = finalizeSpend(spend, wallet.publicKey, sig);
      expect(checkRawTransaction(raw.hex, req)).toEqual({ ok: true, problems: [] });
      const decoded = Transaction.fromRaw(new Uint8Array(Buffer.from(raw.hex, "hex")));
      expect(decoded.getOutput(0).amount).toBe(49_700n);
      txids.add(raw.txid);
    }
    // The witness is not part of the txid: three different signatures, one transaction id.
    expect(txids.size).toBe(1);
  });
});
