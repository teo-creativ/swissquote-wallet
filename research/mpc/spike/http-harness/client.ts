// HTTP harness: P1 (client party, in this process) and the orchestrator.
// Runs a 3-party keygen, then a (P1, P2) and a (P2, P3) signature against the two node servers,
// one HTTP request per node and per round, JSON bodies, HMAC on every request.
// Never prints shares or the secret.
import * as dkls from "@silencelaboratories/dkls-wasm-ll-node";
import { randomBytes, randomUUID } from "node:crypto";
import { encodeFunctionData, erc20Abi, hexToBytes, keccak256, parseGwei, serializeTransaction } from "viem";
import type { Hex } from "viem";
import { signRequest } from "../../../../shared/hmac.ts";
import { MemorySessionStore, keygenFinish, keygenStart, keygenStep, signFinish, signStart, signStep, singleKeyRing } from "../../shared/mpc-node/index.ts";
import type { MpcNodeContext, SignStepResult, StoredShare, WireMessage } from "../../shared/mpc-node/index.ts";
import { addressFromPublicKey, toEthSignature, verifyWithPublicKey } from "../lib.ts";

export type Target = { name: string; partyId: number; url: string };
type Reply<T> = { status: number; body: T & { error?: { code: string; banParty?: number } } };

const timings: Array<{ phase: string; round: string; ms: number; requests: number[] }> = [];
// Largest JSON bodies seen, per protocol (keygen messages are much bigger than signing ones).
const sizes: Record<string, { request: number; response: number }> = {};
let phaseNow = "other";
// Vercel rejects request bodies above 4.5 MB.
const VERCEL_BODY_LIMIT = 4.5 * 1024 * 1024;
// The orchestrator forwards to a node only what that node must handle in the round.
const forParty = (messages: WireMessage[], id: number) => messages.filter((m) => m.from !== id && (m.to === null || m.to === id));

export async function runHarness(secret: string, p2: Target, p3: Target): Promise<boolean> {
  // P1 uses the same node core as the servers, with its own store and storage key.
  const p1: MpcNodeContext = { lib: dkls, store: new MemorySessionStore(), keys: singleKeyRing(1, new Uint8Array(randomBytes(32))), partyId: 0 };
  const results: Array<[string, boolean]> = [];

  async function post<T>(target: Target, path: string, body: unknown, headers?: Record<string, string>): Promise<Reply<T> & { ms: number }> {
    const text = JSON.stringify(body);
    const started = performance.now();
    const res = await fetch(target.url + path, { method: "POST", headers: { "content-type": "application/json", ...(headers ?? signRequest({ secret, method: "POST", path, body: text })) }, body: text });
    const raw = await res.text();
    const size = (sizes[phaseNow] ??= { request: 0, response: 0 });
    size.request = Math.max(size.request, text.length);
    size.response = Math.max(size.response, raw.length);
    return { status: res.status, body: JSON.parse(raw), ms: performance.now() - started };
  }

  // One protocol round: every listed party does its step, remote ones in parallel over HTTP.
  async function round<T>(phase: string, label: string, local: (() => Promise<T>) | null, remote: Array<[Target, string, unknown]>): Promise<T[]> {
    phaseNow = phase.startsWith("sign") ? "sign" : phase;
    const started = performance.now();
    const [mine, replies] = await Promise.all([local ? local() : Promise.resolve(null), Promise.all(remote.map(([t, path, body]) => post<T>(t, path, body)))]);
    for (const [i, r] of replies.entries()) if (r.status !== 200) throw new Error(`${remote[i][0].name} answered ${r.status} ${r.body.error?.code ?? ""} in ${phase} ${label}`);
    timings.push({ phase, round: label, ms: performance.now() - started, requests: replies.map((r) => r.ms) });
    return [...(mine === null ? [] : [mine]), ...replies.map((r) => r.body as T)];
  }

  // ---- Key generation: P1 local, P2 and P3 over HTTP ----
  type K = { messages: WireMessage[]; commitment?: string; done?: boolean; publicKey?: Hex };
  const dkg = randomUUID();
  const nodes = [p2, p3];
  const stepPath = (id: string) => `/api/node/session/${id}/step`;
  let out = await round<K>("keygen", "round 1", () => keygenStart(p1, { sessionId: dkg }), nodes.map((t) => [t, "/api/node/dkg/open", { sessionId: dkg }]));
  let messages = out.flatMap((r) => r.messages);
  out = await round<K>("keygen", "round 2", () => keygenStep(p1, { sessionId: dkg, round: 2, messages }), nodes.map((t) => [t, stepPath(dkg), { round: 2, messages: forParty(messages, t.partyId) }]));
  const commitments = out.map((r) => r.commitment as string); // order = party ids 0, 1, 2
  messages = out.flatMap((r) => r.messages);
  out = await round<K>("keygen", "round 3", () => keygenStep(p1, { sessionId: dkg, round: 3, messages }), nodes.map((t) => [t, stepPath(dkg), { round: 3, messages: forParty(messages, t.partyId) }]));
  messages = out.flatMap((r) => r.messages);
  out = await round<K>("keygen", "round 4", () => keygenStep(p1, { sessionId: dkg, round: 4, messages, commitments }), nodes.map((t) => [t, stepPath(dkg), { round: 4, messages: forParty(messages, t.partyId), commitments }]));
  messages = out.flatMap((r) => r.messages);
  out = await round<K>("keygen", "round 5", () => keygenStep(p1, { sessionId: dkg, round: 5, messages }), nodes.map((t) => [t, stepPath(dkg), { round: 5, messages: forParty(messages, t.partyId) }]));
  const publicKey = out[0].publicKey as Hex;
  results.push(["keygen over HTTP: P1, P2 and P3 report the same public key", out.every((r) => r.done && r.publicKey === publicKey)]);

  // The coordinator checked the public keys: only now do the parties keep their shares.
  let p1Share: StoredShare | null = null;
  const commits = await round<{ partyId: number; publicKey: Hex }>(
    "keygen",
    "commit",
    async () => {
      p1Share = await keygenFinish(p1, { sessionId: dkg, publicKey });
      return { partyId: 0, publicKey: p1Share.publicKey };
    },
    nodes.map((t) => [t, "/api/node/dkg/commit", { sessionId: dkg, publicKey }]),
  );
  results.push(["keygen over HTTP: both nodes stored their share for that public key", commits.every((c) => c.publicKey === publicKey)]);
  const address = addressFromPublicKey(hexToBytes(publicKey));
  console.log(`Wallet address: ${address}`);

  // A realistic payload: an unsigned EIP-1559 USDC transfer. Each node hashes it itself.
  const unsignedTx = serializeTransaction({ type: "eip1559", chainId: 84532, nonce: 0, to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", value: 0n, gas: 60000n, maxFeePerGas: parseGwei("0.01"), maxPriorityFeePerGas: parseGwei("0.001"), data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: ["0x000000000000000000000000000000000000dEaD", 1_000_000n] }) });
  const hash = keccak256(unsignedTx);

  async function checkSignature(label: string, sig: SignStepResult["signature"]): Promise<void> {
    const eth = sig ? await toEthSignature({ r: hexToBytes(sig.r), s: hexToBytes(sig.s) }, hash, address) : null;
    results.push([`${label}: signature recovers the wallet address and verifies`, eth !== null && verifyWithPublicKey(eth, hash, hexToBytes(publicKey))]);
  }

  // ---- Signature (P1, P2): P1 local, P2 over HTTP. P2 sends its last message, P1 combines. ----
  {
    const id = randomUUID();
    const signers = [0, 1];
    const phase = "sign P1+P2";
    let s = await round<SignStepResult>(phase, "round 1", () => signStart(p1, { sessionId: id, share: p1Share as StoredShare, signers, messageHash: hexToBytes(hash) }), [[p2, "/api/node/sign/open", { sessionId: id, publicKey, signers, unsignedTx }]]);
    for (const r of [2, 3, 4]) {
      const batch = s.flatMap((x) => x.messages);
      s = await round<SignStepResult>(phase, `round ${r}`, () => signStep(p1, { sessionId: id, round: r, messages: batch }), [[p2, stepPath(id), { round: r, messages: forParty(batch, p2.partyId) }]]);
    }
    const [fromP2] = await round<SignStepResult>(phase, "round 5", null, [[p2, `/api/node/session/${id}/finish`, {}]]);
    const started = performance.now();
    const final = await signFinish(p1, { sessionId: id, peerLast: fromP2.messages });
    timings.push({ phase, round: "round 6 (P1 combines locally)", ms: performance.now() - started, requests: [] });
    await checkSignature("sign (P1, P2) over HTTP", final.signature);

    // The node destroyed its pre-signature: asking again must fail.
    const again = await post<SignStepResult>(p2, `/api/node/session/${id}/finish`, {});
    results.push(["P2 refuses a second last message for the same session (409 SESSION_NOT_FOUND)", again.status === 409 && again.body.error?.code === "SESSION_NOT_FOUND"]);
  }

  // ---- Signature (P2, P3): both over HTTP, the orchestrator only relays (recovery path). ----
  {
    const id = randomUUID();
    const signers = [1, 2];
    const phase = "sign P2+P3";
    let s = await round<SignStepResult>(phase, "round 1", null, nodes.map((t) => [t, "/api/node/sign/open", { sessionId: id, publicKey, signers, unsignedTx }]));
    for (const r of [2, 3, 4]) {
      const batch = s.flatMap((x) => x.messages);
      s = await round<SignStepResult>(phase, `round ${r}`, null, nodes.map((t) => [t, stepPath(id), { round: r, messages: forParty(batch, t.partyId) }]));
    }
    const [fromP2] = await round<SignStepResult>(phase, "round 5", null, [[p2, `/api/node/session/${id}/finish`, {}]]);
    const [fromP3] = await round<SignStepResult>(phase, "round 6", null, [[p3, `/api/node/session/${id}/finish`, { peerLast: fromP2.messages }]]);
    await checkSignature("sign (P2, P3) over HTTP", fromP3.signature);
  }

  // ---- Transport checks ----
  phaseNow = "other";
  {
    const path = "/api/node/dkg/open";
    const body = { sessionId: randomUUID() };
    const text = JSON.stringify(body);
    const headers = signRequest({ secret, method: "POST", path, body: text });
    const first = await post(p2, path, body, headers);
    const replay = await post<object>(p2, path, body, headers);
    results.push(["HMAC: a replayed request (same nonce) is rejected (401 REPLAYED_NONCE)", first.status === 200 && replay.status === 401 && replay.body.error?.code === "REPLAYED_NONCE"]);
    const unsigned = await post<object>(p2, path, { sessionId: randomUUID() }, {});
    results.push(["HMAC: a request without headers is rejected (401)", unsigned.status === 401]);
    const wrongSecret = await post<object>(p3, path, body, signRequest({ secret: `${secret}x`, method: "POST", path, body: text }));
    results.push(["HMAC: a request signed with another secret is rejected (401 BAD_SIGNATURE)", wrongSecret.status === 401 && wrongSecret.body.error?.code === "BAD_SIGNATURE"]);
    const otherBody = await post<object>(p3, path, { sessionId: randomUUID() }, signRequest({ secret, method: "POST", path, body: text }));
    results.push(["HMAC: a signature does not cover another body (401 BAD_SIGNATURE)", otherBody.status === 401 && otherBody.body.error?.code === "BAD_SIGNATURE"]);
  }

  // ---- Report ----
  console.log("");
  console.log("Latency per round (localhost, wall time for the round; per request in brackets)");
  for (const t of timings) console.log(`  ${t.phase.padEnd(11)} ${t.round.padEnd(30)} ${t.ms.toFixed(0).padStart(5)} ms  [${t.requests.map((r) => `${r.toFixed(0)} ms`).join(", ")}]`);
  for (const phase of ["keygen", "sign P1+P2", "sign P2+P3"]) {
    const total = timings.filter((t) => t.phase === phase).reduce((a, t) => a + t.ms, 0);
    console.log(`  total ${phase}: ${total.toFixed(0)} ms`);
  }
  for (const phase of ["keygen", "sign"]) console.log(`Largest JSON body in ${phase}: request ${sizes[phase].request} bytes, response ${sizes[phase].response} bytes`);
  const biggest = Math.max(...Object.values(sizes).flatMap((s) => [s.request, s.response]));
  results.push(["every body stays under the 4.5 MB request limit of Vercel functions", biggest < VERCEL_BODY_LIMIT]);
  console.log(`CDC annex A caps state-changing routes at 64 KB: keygen ${sizes.keygen.request > 64 * 1024 ? "EXCEEDS" : "fits"}, signing ${sizes.sign.request > 64 * 1024 ? "EXCEEDS" : "fits"}`);
  console.log("");
  for (const [name, ok] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  return results.every(([, ok]) => ok);
}
