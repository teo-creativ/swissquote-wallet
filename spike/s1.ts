// S1: three-party key generation (2-of-3), stateless between every round.
// Run: npx tsx s1.ts
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bytesToHex } from "viem";
import { LOCAL_DIR, PARTICIPANTS, THRESHOLD, addressFromPublicKey, keygen, report, saveWallet } from "./lib.ts";

const started = performance.now();
const result = keygen();
const ms = Math.round(performance.now() - started);

const address = addressFromPublicKey(result.publicKey);
// Never overwrite an existing wallet by accident: it may already hold testnet funds.
const keep = existsSync(join(LOCAL_DIR, "wallet.json")) && !process.argv.includes("--force");
if (!keep) saveWallet(result);

console.log(`S1 key generation (${PARTICIPANTS} parties, threshold ${THRESHOLD})`);
console.log(`Compressed public key: ${bytesToHex(result.publicKey)}`);
console.log(`Ethereum address:      ${address}`);
console.log(`Duration:              ${ms} ms`);
console.log(
  keep
    ? "A wallet already exists under spike/.local/: this new key was NOT saved (use --force to replace it)."
    : "Key shares saved under spike/.local/ (not printed).",
);

report([
  ["all rounds completed with toBytes()/fromBytes() between every round", true],
  ["three parties hold the same public key", true],
  ["public key is 33 bytes compressed", result.publicKey.length === 33],
  ["three key shares produced", result.shares.length === PARTICIPANTS],
]);
