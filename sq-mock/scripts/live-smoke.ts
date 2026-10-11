// Real-chain smoke test of the sq-mock Safe services, without HTTP: P3 owner, sponsored deploy, bank transfer, sponsored
// transfer signed by two owners, recovery with the P3 signing conditions. Throwaway P1/P2 keys live in memory only.
// Run (from sq-mock/): npx tsx scripts/live-smoke.ts   Prints addresses and Basescan links only.
import { randomUUID } from "node:crypto";
import { getAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { packSignatures, safeTxHash, saltNonceFor, swapOwnerTx, usdcTransferTx } from "../src/shared/safe";
import { bankTransfer } from "../lib/bank";
import { viemChain } from "../lib/chain";
import { readConfig } from "../lib/config";
import { consoleIdentityOutcome } from "../lib/console";
import { ownerCreate } from "../lib/owner";
import { identityVerify } from "../lib/recovery";
import { nodeSign, recoveryExecuted, recoveryOpen } from "../lib/safe-recovery";
import { seedDemoData } from "../lib/seed";
import { kyc, type Deps } from "../lib/services";
import { gasDeploy, gasExec } from "../lib/sponsor";
import { MemoryStore } from "../lib/store";

process.loadEnvFile(".env.local");
const link = (h: string) => `https://sepolia.basescan.org/tx/${h}`;
const step = (s: string) => console.log(`\n== ${s}`);
const key = () => privateKeyToAccount(generatePrivateKey());

async function main() {
  const store = new MemoryStore();
  await seedDemoData(store, "smoke-only");
  const config = { ...readConfig({ ...process.env, SQ_DEMO_BANKING_ANSWER: "smoke" }), kycDelayMs: 0, recoveryDelaySeconds: 2 };
  const env = { ...process.env, SQ_SHARE_ENC_KEY: process.env.SQ_SHARE_ENC_KEY ?? "" };
  const deps = (): Deps => ({ store, chain: viemChain(config.usdcAddress, process.env), config, env, now: new Date(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  const lea = (await store.getClient("client.lea"))!;
  const sqRef = lea.sqRef;
  const [p1, p2, p1New] = [key(), key(), key()];

  step("P3 owner (encrypted at rest) and sponsored deploy");
  const { address: p3 } = await ownerCreate(deps(), { sqRef });
  const dep = await gasDeploy(deps(), { sqRef, owners: [p1.address, p2.address, p3], threshold: 2, saltNonce: saltNonceFor(sqRef).toString() });
  console.log("safe", dep.address, "\ndeploy", link(dep.txHash!));

  step("Bank transfer: 2 USDC from the demo wallet to the Safe");
  await kyc(deps(), { sqRef });
  const bank = await bankTransfer(deps(), { sqRef, to: dep.address, amountUsdc: "2000000" });
  await deps().chain.getEthBalance(dep.address); // keep the RPC node warm
  await new Promise((r) => setTimeout(r, 4000));
  console.log("bank", link(bank.txHash));

  step("Sponsored USDC transfer signed by P1 + P2 (owners hold no ETH)");
  const chain = deps().chain;
  const dest = key().address;
  const pay = usdcTransferTx(config.usdcAddress, dest, 300_000n);
  const state0 = await chain.getSafeState(dep.address);
  const hash0 = safeTxHash({ safe: dep.address, tx: pay, nonce: state0.nonce });
  const sig = async (a: ReturnType<typeof key>, h: Hex) => ({ signer: a.address, signature: await a.sign({ hash: h }) });
  const exec = await gasExec(deps(), {
    safeAddress: dep.address, safeTx: { to: pay.to, value: "0", data: pay.data }, signatures: packSignatures([await sig(p1, hash0), await sig(p2, hash0)]),
  });
  console.log("transfer", link(exec.txHash), "to", dest);

  step("Attacker: console sets the check to fail, P3 refuses");
  const state1 = await chain.getSafeState(dep.address);
  const attackId = randomUUID();
  await recoveryOpen(deps(), { sqRef, recoveryId: attackId, safeAddress: dep.address, newOwnerAddress: key().address });
  await consoleIdentityOutcome(deps(), { clientId: "client.lea", outcome: "fail" });
  console.log("identity", await identityVerify(deps(), { recoveryId: attackId, selfie: "x", bankingAnswer: "smoke" }));
  const atkTx = swapOwnerTx({ safe: dep.address, owners: state1.owners, oldOwner: p1.address, newOwner: key().address });
  const atkHash = safeTxHash({ safe: dep.address, tx: atkTx, nonce: state1.nonce });
  try {
    await nodeSign(deps(), { recoveryId: attackId, safeTxHash: atkHash, p2Signature: await p2.sign({ hash: atkHash }) });
    throw new Error("P3 SIGNED FOR AN ATTACKER");
  } catch (e) {
    if (e instanceof Error && e.message === "P3 SIGNED FOR AN ATTACKER") throw e;
    console.log("refused as expected:", (e as { code?: string }).code);
  }

  step("Legitimate recovery: identity passes, delay 2 s, lawyer approves, P2 + P3 swap P1 for P1'");
  await consoleIdentityOutcome(deps(), { clientId: "client.lea", outcome: "pass" });
  const recoveryId = randomUUID();
  await recoveryOpen(deps(), { sqRef, recoveryId, safeAddress: dep.address, newOwnerAddress: p1New.address });
  await identityVerify(deps(), { recoveryId, selfie: "x", bankingAnswer: "smoke" });
  const tx = swapOwnerTx({ safe: dep.address, owners: state1.owners, oldOwner: p1.address, newOwner: p1New.address });
  const hash = safeTxHash({ safe: dep.address, tx, nonce: state1.nonce });
  const lawyer = await sig(p2, hash);
  try {
    await nodeSign(deps(), { recoveryId, safeTxHash: hash, p2Signature: lawyer.signature });
    throw new Error("P3 SIGNED DURING THE DELAY");
  } catch (e) {
    if (e instanceof Error && e.message === "P3 SIGNED DURING THE DELAY") throw e;
    console.log("during the delay:", (e as { code?: string }).code);
  }
  await new Promise((r) => setTimeout(r, 2500));
  const p3sig = await nodeSign(deps(), { recoveryId, safeTxHash: hash, p2Signature: lawyer.signature });
  const swap = await gasExec(deps(), {
    safeAddress: dep.address, safeTx: { to: tx.to, value: "0", data: tx.data }, signatures: packSignatures([lawyer, { signer: p3sig.signer, signature: p3sig.signature }]),
  });
  await recoveryExecuted(deps(), { recoveryId, txHash: swap.txHash });
  const owners = (await chain.getSafeState(dep.address)).owners.map(getAddress);
  console.log("swapOwner", link(swap.txHash), "\nowners now", owners.join(", "));
  if (!owners.includes(getAddress(p1New.address)) || owners.includes(getAddress(p1.address))) throw new Error("owner set is wrong");
  console.log("\nSMOKE OK");
}

main().catch((e) => {
  console.error("SMOKE FAILED:", e instanceof Error ? e.message.split("\n")[0] : "unknown error");
  process.exit(1);
});
