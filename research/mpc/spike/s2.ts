// S2: sign a 32-byte hash with every pair of parties and verify each signature.
// Run: npx tsx s2.ts (after s1.ts)
import { bytesToHex, hexToBytes, keccak256, stringToHex } from "viem";
import { PARTY_NAMES, loadShare, loadWallet, report, signPair, toEthSignature, verifyWithPublicKey } from "./lib.ts";

const { address, publicKey } = loadWallet();
const hash = keccak256(stringToHex("SQ Keys M0 spike: S2 signing test"));
const pairs: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 2],
];

console.log(`S2 signing, wallet ${address}`);
console.log(`Hash: ${hash}`);

const results: Array<[string, boolean]> = [];
for (const pair of pairs) {
  const label = `pair (${pair.join(",")}) ${pair.map((id) => PARTY_NAMES[id]).join(" + ")}`;
  try {
    const started = performance.now();
    const { signIds, signatures } = signPair(pair.map(loadShare), hexToBytes(hash));
    const ms = Math.round(performance.now() - started);

    // Both signers must end with the same [R, S].
    const same = signatures.every((sig) => bytesToHex(sig.r) === bytesToHex(signatures[0].r) && bytesToHex(sig.s) === bytesToHex(signatures[0].s));
    const eth = await toEthSignature(signatures[0], hash, address);
    const valid = eth !== null && verifyWithPublicKey(eth, hash, hexToBytes(publicKey));

    console.log(`${label}: keyshare ids [${pair}] -> ids used in sign messages [${signIds}], ${ms} ms`);
    if (eth) console.log(`  yParity ${eth.yParity}, S was ${eth.wasHighS ? "high (normalised)" : "already low"}`);
    results.push([`${label}: both signers return the same [R, S]`, same]);
    results.push([`${label}: signature recovers and verifies for the wallet address`, valid]);
  } catch (err) {
    console.log(`${label}: ${(err as Error).message}`);
    results.push([label, false]);
  }
}
report(results);
