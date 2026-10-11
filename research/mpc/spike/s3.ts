// S3: negative tests. Uses a throwaway in-memory wallet, never the funded one,
// because these tests deliberately misuse sessions and pre-signatures.
// Run: npx tsx s3.ts
import { SignSession } from "@silencelaboratories/dkls-wasm-ll-node";
import { hexToBytes, keccak256, stringToHex } from "viem";
import type { Tamper } from "./lib.ts";
import { addressFromPublicKey, finish, keygen, presign, report, toEthSignature, verifyWithPublicKey } from "./lib.ts";

const wallet = keygen();
const address = addressFromPublicKey(wallet.publicKey);
const pair = [wallet.shares[0], wallet.shares[1]];
const hashA = keccak256(stringToHex("S3 hash A"));
const hashB = keccak256(stringToHex("S3 hash B"));
const results: Array<[string, boolean]> = [];

// Describe an error without assuming its shape. banParty is set on AbortProtocolAndBanParty.
function describe(err: unknown): string {
  const e = err as { name?: string; message?: string; banParty?: number };
  const ban = e?.banParty === undefined ? "" : `, banParty=${e.banParty}`;
  return `${e?.name ?? typeof err}: ${String(e?.message ?? err).slice(0, 120)}${ban}`;
}

console.log("S3 negative tests (throwaway wallet)");

// 1. A signature made for hash A must not verify for hash B.
{
  const eth = await toEthSignature(finish(presign(pair), hexToBytes(hashA))[0], hashA, address);
  const goodOnA = eth !== null && verifyWithPublicKey(eth, hashA, wallet.publicKey);
  const badOnB = eth !== null && !verifyWithPublicKey(eth, hashB, wallet.publicKey);
  const noRecovery = eth !== null && (await toEthSignature({ r: hexToBytes(eth.r), s: hexToBytes(eth.s) }, hashB, address)) === null;
  results.push(["control: signature verifies for the hash that was signed", goodOnA]);
  results.push(["different hash: public key verification fails", badOnB]);
  results.push(["different hash: no yParity recovers the wallet address", noRecovery]);
}

// 2. A tampered message must abort the protocol or at least never yield a valid signature.
for (const round of [1, 2, 3, 5]) {
  // Flip one bit in the middle of the first message of that round (sent by the first signer).
  const tamper: Tamper = (r, wires) => {
    if (r !== round) return;
    const payload = wires[0].payload;
    payload[payload.length >> 1] ^= 0x01;
  };
  let outcome: string;
  let safe: boolean;
  try {
    const pre = presign(pair, tamper);
    const sigs = finish(pre, hexToBytes(hashA), tamper);
    const valid = (await Promise.all(sigs.map((sig) => toEthSignature(sig, hashA, address)))).some((eth) => eth !== null);
    safe = !valid;
    outcome = valid ? "NOT detected, a valid signature came out" : "no throw, but the signature is invalid";
  } catch (err) {
    safe = true;
    outcome = `aborted with ${describe(err)}`;
  }
  console.log(`  tamper round ${round}: ${outcome}`);
  results.push([`tampered round ${round} message never yields a valid signature`, safe]);
}

// 3. A consumed session cannot be used again.
{
  const pre = presign(pair);
  const sessions = pre.state.map((b) => SignSession.fromBytes(b));
  const last = sessions.map((s) => s.lastMessage(hexToBytes(hashA)));
  sessions[0].combine([last[1]]);
  let outcome = "second use was accepted";
  let rejected = false;
  try {
    sessions[0].lastMessage(hexToBytes(hashA)).free();
  } catch (err) {
    rejected = true;
    outcome = `rejected with ${describe(err)}`;
  }
  console.log(`  reuse after combine(): ${outcome}`);
  results.push(["session consumed by combine() cannot produce another message", rejected]);

  // Same question one step earlier: lastMessage() twice on the same live session (same hash, harmless).
  let twice = "accepted (the library does not block it)";
  let twiceRejected = false;
  try {
    sessions[1].lastMessage(hexToBytes(hashA)).free();
  } catch (err) {
    twiceRejected = true;
    twice = `rejected with ${describe(err)}`;
  }
  console.log(`  lastMessage() twice on one session: ${twice}`);
  results.push(["lastMessage() cannot be called twice on one session", twiceRejected]);
  last[0].free();
  if (!twiceRejected) sessions[1].free();
}

// 4. Finding for the node design (informational): pre-signature BYTES are not protected by the library.
// Restoring the same serialized pre-signature a second time works, so the node itself must
// delete the stored bytes before calling lastMessage. Same hash is used twice here, which leaks nothing.
{
  const pre = presign(pair);
  finish(pre, hexToBytes(hashA));
  let replay: string;
  try {
    finish(pre, hexToBytes(hashA));
    replay = "ACCEPTED by the library: the driver must delete stored pre-signatures (single use is our job)";
  } catch (err) {
    replay = `rejected with ${describe(err)}`;
  }
  console.log(`  INFO restore the same serialized pre-signature twice: ${replay}`);
}

report(results);
