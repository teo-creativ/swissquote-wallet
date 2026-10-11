// Dry run without funds: spends a FAKE UTXO, so the result can never be broadcast.
// For each pair of parties: sign the BIP143 sighash with DKLs23, convert to low S and DER,
// verify against the wallet public key, build the raw transaction, decode it again and re-check it.
// Run: npm run btc:dryrun
import { DEFAULT_FEE_SATS, NETWORK_NAME, PAIRS, buildSpend, checkRawTransaction, finalizeSpend, loadOrCreateWallet, pairName, report, signWithPair, toBitcoinSignature, verifyDer } from "./lib.ts";
import type { SpendRequest } from "./lib.ts";

const { wallet, created } = await loadOrCreateWallet();
console.log(`Dry run on ${NETWORK_NAME}. FAKE UTXO: this transaction spends nothing and must not be broadcast.`);
if (created) console.log("No wallet yet: ran a 3-party DKLs23 key generation first.");
console.log(`Address: ${wallet.address}`);

// A txid that exists nowhere, 100 000 sats, sent back to the wallet itself.
const req: SpendRequest = { publicKey: wallet.publicKey, utxo: { txid: "ab".repeat(32), vout: 0, amountSats: 100_000n }, to: wallet.address, feeSats: DEFAULT_FEE_SATS };
const spend = buildSpend(req);
const results: Array<[string, boolean]> = [["address is native SegWit testnet (tb1q...)", wallet.address.startsWith("tb1q")]];

for (const pair of PAIRS) {
  const name = `pair ${pairName(pair)}`;
  try {
    const started = performance.now();
    const raw = await signWithPair(wallet, pair, spend.sighash);
    const ms = performance.now() - started;
    const sig = toBitcoinSignature(raw, spend.sighash, wallet.publicKey);
    results.push([`${name}: signature is low S, DER, and verifies for the wallet public key`, verifyDer(sig.der, spend.sighash, wallet.publicKey)]);
    const other = new Uint8Array(spend.sighash);
    other[0] ^= 0x01;
    results.push([`${name}: the signature does not verify for another hash`, !verifyDer(sig.der, other, wallet.publicKey)]);
    const final = finalizeSpend(spend, wallet.publicKey, sig);
    const check = checkRawTransaction(final.hex, req);
    for (const p of check.problems) console.log(`  ${name}: ${p}`);
    results.push([`${name}: raw transaction decodes back to the same spend with a valid witness`, check.ok]);
    console.log(`  ${name}: signed in ${ms.toFixed(0)} ms${sig.wasHighS ? " (S was high, normalised)" : ""}, ${final.vsize} vB`);
    console.log(`  raw tx (fake input, do not broadcast): ${final.hex}`);
  } catch (err) {
    console.log(`  ${name}: ${(err as Error).message}`);
    results.push([`${name}: signs`, false]);
  }
}
report(results);
