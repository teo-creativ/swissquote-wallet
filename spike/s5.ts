// S5: timing of key generation and of one full signature, plus a platform check.
// Run: npx tsx s5.ts (plain tsx, no bundler)
import { createRequire } from "node:module";
import { hexToBytes, keccak256, stringToHex } from "viem";
import { addressFromPublicKey, keygen, report, signPair, toEthSignature } from "./lib.ts";

const RUNS = 5;
const SIGN_BUDGET_MS = 10_000; // CDC 3.5: a full signature must stay under 10 seconds

const time = <T>(fn: () => T): [T, number] => {
  const started = performance.now();
  const out = fn();
  return [out, performance.now() - started];
};
const stats = (ms: number[]) => `min ${Math.round(Math.min(...ms))} ms, avg ${Math.round(ms.reduce((a, b) => a + b, 0) / ms.length)} ms, max ${Math.round(Math.max(...ms))} ms`;

// Throwaway wallets only: nothing is saved.
const keygenMs: number[] = [];
let wallet = keygen();
for (let i = 0; i < RUNS; i++) {
  const [w, ms] = time(keygen);
  wallet = w;
  keygenMs.push(ms);
}

const hash = keccak256(stringToHex("S5 timing"));
const signMs: number[] = [];
let lastValid = false;
for (let i = 0; i < RUNS; i++) {
  const [out, ms] = time(() => signPair([wallet.shares[0], wallet.shares[1]], hexToBytes(hash)));
  signMs.push(ms);
  lastValid = (await toEthSignature(out.signatures[0], hash, addressFromPublicKey(wallet.publicKey))) !== null;
}

const wasmEntry = createRequire(import.meta.url).resolve("@silencelaboratories/dkls-wasm-ll-node");
console.log("S5 timing (in-process, both parties on this machine, no network)");
console.log(`Platform: ${process.platform} ${process.arch}, Node ${process.version}`);
console.log(`Keygen 3 parties, stateless rounds (${RUNS} runs after warm-up): ${stats(keygenMs)}`);
console.log(`One full signature, 2 parties, stateless rounds (${RUNS} runs): ${stats(signMs)}`);

report([
  ["WASM package loads with plain tsx, straight from node_modules", wasmEntry.includes("node_modules")],
  ["last timed signature is valid", lastValid],
  [`one signature computes in under ${SIGN_BUDGET_MS / 1000} s`, Math.max(...signMs) < SIGN_BUDGET_MS],
]);
