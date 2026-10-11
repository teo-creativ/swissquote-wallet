import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { packSignatures, safeTxHash, saltNonceFor, swapOwnerTx, usdcTransferTx } from "../src/shared/safe";
import { verifyAuditChain } from "./audit";
import { bankTransfer } from "./bank";
import { consoleIdentityOutcome, consoleOperatorActions } from "./console";
import { ApiError } from "./errors";
import { ownerCreate } from "./owner";
import { identityVerify, recoveryCancel, recoveryStatus } from "./recovery";
import { nodeSign, recoveryAttach, recoveryExecuted, recoveryOpen } from "./safe-recovery";
import { kyc, resolveAccount } from "./services";
import { gasDeploy, gasExec } from "./sponsor";
import { TEST_BANKING_ANSWER, testDeps } from "./testkit";

const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const key = () => privateKeyToAccount(generatePrivateKey()); // throwaway test owners, never hold funds

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof ApiError) return `${e.status} ${e.code}`; throw e; }
  return "no error";
}

/** A client with its three owners and a deployed Safe (P1 and P2 are test keys, P3 is the node's own key). */
async function withSafe() {
  const t = await testDeps();
  const { sqRef } = t.lea;
  const p1 = key();
  const p2 = key();
  const { address: p3 } = await ownerCreate(t.deps, { sqRef });
  const deployed = await gasDeploy(t.deps, { sqRef, owners: [p1.address, p2.address, p3], threshold: 2, saltNonce: saltNonceFor(sqRef).toString() });
  return { ...t, sqRef, p1, p2, p3, safe: deployed.address, deployed };
}
const sigs = async (hash: Hex, signers: ReturnType<typeof key>[]) =>
  packSignatures(await Promise.all(signers.map(async (s) => ({ signer: s.address, signature: await s.sign({ hash }) }))));
const execBody = (safe: Address, tx: { to: Address; data: Hex }, signatures: Hex) => ({ safeAddress: safe, safeTx: { to: tx.to, value: "0", data: tx.data }, signatures });

describe("P3 owner key", () => {
  it("is created once per account, idempotent, and stored only encrypted", async () => {
    const { deps, store, lea } = await testDeps();
    const first = await ownerCreate(deps, { sqRef: lea.sqRef });
    const again = await ownerCreate(deps, { sqRef: lea.sqRef });
    expect(again).toEqual(first);
    expect(first.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const share = (await store.getOwnerShare(lea.sqRef))!;
    expect(share.keyshareEnc).toMatch(/^[0-9a-f]+$/);
    expect(share.keyshareEnc.length).toBe((32 + 16) * 2); // 32 byte key + 16 byte GCM tag
    expect(JSON.stringify(await store.listAudit())).not.toContain(share.keyshareEnc);
    expect(await store.getOwnerShare((await store.getClient("client.demo"))!.sqRef)).toBeNull();
  });
  it("gives each account its own address and refuses unknown accounts or a missing encryption key", async () => {
    const { deps, lea, demo } = await testDeps();
    expect((await ownerCreate(deps, { sqRef: lea.sqRef })).address).not.toBe((await ownerCreate(deps, { sqRef: demo.sqRef })).address);
    expect(await code(ownerCreate(deps, { sqRef: randomUUID() }))).toBe("404 UNKNOWN_CLIENT");
    const fresh = await testDeps();
    expect(await code(ownerCreate({ ...fresh.deps, env: {} }, { sqRef: fresh.lea.sqRef }))).toBe("500 NOT_CONFIGURED");
  });
});

describe("sponsored deployment (gas/deploy)", () => {
  it("deploys the 2-of-3 Safe, links it to the client and is idempotent", async () => {
    const { deps, chain, lea, p1, p2, p3, safe, deployed, store } = await withSafe();
    expect(deployed.alreadyDeployed).toBe(false);
    expect(await chain.getCode(safe)).toBeDefined();
    expect((await store.getSafeAccount(lea.sqRef))?.safeAddress).toBe(safe.toLowerCase());
    expect(await resolveAccount(deps, { sqRef: lea.sqRef })).toEqual({ address: getAddress(safe) });
    const again = await gasDeploy(deps, { sqRef: lea.sqRef, owners: [p1.address, p2.address, p3], threshold: 2, saltNonce: saltNonceFor(lea.sqRef).toString() });
    expect(again).toMatchObject({ address: safe, alreadyDeployed: true });
    expect(chain.deployCalls).toBe(1);
    expect(verifyAuditChain(await store.listAudit())).toBeNull();
  });
  it("refuses a Safe where the bank's own key is not the third owner", async () => {
    const t = await testDeps();
    await ownerCreate(t.deps, { sqRef: t.lea.sqRef });
    const body = { sqRef: t.lea.sqRef, threshold: 2, saltNonce: saltNonceFor(t.lea.sqRef).toString() };
    expect(await code(gasDeploy(t.deps, { ...body, owners: [key().address, key().address, key().address] }))).toBe("403 NOT_OUR_OWNER");
  });
  it("refuses bad input: no P3 yet, wrong salt, wrong threshold, duplicate or missing owners", async () => {
    const t = await testDeps();
    const a = [key().address, key().address];
    const base = { sqRef: t.lea.sqRef, threshold: 2, saltNonce: saltNonceFor(t.lea.sqRef).toString() };
    expect(await code(gasDeploy(t.deps, { ...base, owners: [...a, key().address] }))).toBe("409 OWNER_NOT_CREATED");
    const { address: p3 } = await ownerCreate(t.deps, { sqRef: t.lea.sqRef });
    expect(await code(gasDeploy(t.deps, { ...base, owners: [...a, p3], saltNonce: "12345" }))).toBe("400 INVALID_INPUT");
    expect(await code(gasDeploy(t.deps, { ...base, owners: [...a, p3], threshold: 1 }))).toBe("400 INVALID_INPUT");
    expect(await code(gasDeploy(t.deps, { ...base, owners: [a[0], a[0], p3] }))).toBe("400 INVALID_INPUT");
    expect(await code(gasDeploy(t.deps, { ...base, owners: a }))).toBe("400 INVALID_INPUT");
    expect(await code(gasDeploy(t.deps, { ...base, owners: [...a, "0x123"] }))).toBe("400 INVALID_INPUT");
  });
  it("enforces the daily cap and pauses when the sponsor is out of funds", async () => {
    const t = await testDeps();
    const { address: p3 } = await ownerCreate(t.deps, { sqRef: t.lea.sqRef });
    const body = { sqRef: t.lea.sqRef, owners: [key().address, key().address, p3], threshold: 2, saltNonce: saltNonceFor(t.lea.sqRef).toString() };
    t.chain.sponsorWei = 0n;
    expect(await code(gasDeploy(t.deps, body))).toBe("503 SPONSOR_OUT_OF_FUNDS");
    t.chain.sponsorWei = 10n ** 18n;
    expect(await code(gasDeploy({ ...t.deps, config: { ...t.deps.config, sponsorMaxDeploysPerDay: 0 } }, body))).toBe("429 SPONSOR_DAILY_CAP");
    expect(t.chain.deployCalls).toBe(0);
  });
});

describe("sponsored execution (gas/exec)", () => {
  it("executes a USDC transfer signed by two owners; the owners hold no ETH", async () => {
    const { deps, chain, safe, p1, p2 } = await withSafe();
    const tx = usdcTransferTx(USDC, key().address, 250_000n);
    const hash = safeTxHash({ safe, tx, nonce: 0n });
    const res = await gasExec(deps, execBody(safe, tx, await sigs(hash, [p1, p2])));
    expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.executed).toHaveLength(1);
    expect(chain.gasSent).toHaveLength(0);
  });
  it("accepts any two of the three owners, including P2 + P3 with no client key", async () => {
    const { deps, safe, p1, p2, store, sqRef } = await withSafe();
    const share = (await store.getOwnerShare(sqRef))!;
    expect(share.address).not.toBe(p1.address.toLowerCase());
    const tx = usdcTransferTx(USDC, key().address, 1n);
    const hash = safeTxHash({ safe, tx, nonce: 0n });
    expect(await code(gasExec(deps, execBody(safe, tx, await sigs(hash, [p1]))))).toBe("400 INVALID_INPUT"); // one signature is not enough
    expect(await code(gasExec(deps, execBody(safe, tx, await sigs(hash, [p1, key()]))))).toBe("422 EXECUTION_REVERTED"); // a stranger's signature does not count
    expect(await code(gasExec(deps, execBody(safe, tx, await sigs(hash, [p1, p2]))))).toBe("no error");
  });
  it("refuses unknown wallets, ETH value and other nonces", async () => {
    const { deps, safe, p1, p2 } = await withSafe();
    const tx = usdcTransferTx(USDC, key().address, 5n);
    const good = await sigs(safeTxHash({ safe, tx, nonce: 0n }), [p1, p2]);
    expect(await code(gasExec(deps, execBody(key().address, tx, good)))).toBe("404 UNKNOWN_SAFE");
    expect(await code(gasExec(deps, { ...execBody(safe, tx, good), safeTx: { to: tx.to, value: "1", data: tx.data } }))).toBe("400 VALUE_NOT_ALLOWED");
    const stale = await sigs(safeTxHash({ safe, tx, nonce: 9n }), [p1, p2]);
    expect(await code(gasExec(deps, execBody(safe, tx, stale)))).toBe("422 EXECUTION_REVERTED");
  });
  it("caps sponsored transactions per wallet", async () => {
    const { deps, safe, p1, p2 } = await withSafe();
    const capped = { ...deps, config: { ...deps.config, sponsorMaxExecsPerSafePerDay: 1 } };
    const tx = usdcTransferTx(USDC, key().address, 5n);
    await gasExec(capped, execBody(safe, tx, await sigs(safeTxHash({ safe, tx, nonce: 0n }), [p1, p2])));
    expect(await code(gasExec(capped, execBody(safe, tx, await sigs(safeTxHash({ safe, tx, nonce: 1n }), [p1, p2]))))).toBe("429 SPONSOR_SAFE_CAP");
  });
});

describe("bank transfer (real USDC to the client's own Safe)", () => {
  it("needs the identity check, a wallet, and only sends to that wallet", async () => {
    const { deps, chain, lea, safe } = await withSafe();
    const body = { sqRef: lea.sqRef, to: safe, amountUsdc: "5000000" };
    expect(await code(bankTransfer(deps, body))).toBe("403 KYC_REQUIRED");
    await kyc(deps, { sqRef: lea.sqRef });
    expect(await code(bankTransfer(deps, { ...body, to: key().address }))).toBe("403 RECIPIENT_NOT_YOUR_WALLET");
    expect(await code(bankTransfer(deps, { ...body, amountUsdc: "99000000" }))).toBe("400 AMOUNT_ABOVE_LIMIT");
    const res = await bankTransfer(deps, body);
    expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.usdcSent).toEqual([{ to: getAddress(safe), amount: 5_000_000n }]);
  });
  it("refuses a client without a wallet and enforces the daily limit", async () => {
    const t = await testDeps();
    await kyc(t.deps, { sqRef: t.demo.sqRef });
    expect(await code(bankTransfer(t.deps, { sqRef: t.demo.sqRef, to: key().address, amountUsdc: "1" }))).toBe("403 NO_WALLET");
    const w = await withSafe();
    await kyc(w.deps, { sqRef: w.sqRef });
    const limited = { ...w.deps, config: { ...w.deps.config, bankMaxTransfersPerDay: 1 } };
    await bankTransfer(limited, { sqRef: w.sqRef, to: w.safe, amountUsdc: "1000000" });
    expect(await code(bankTransfer(limited, { sqRef: w.sqRef, to: w.safe, amountUsdc: "1000000" }))).toBe("429 DAILY_LIMIT_REACHED");
  });
});

describe("recovery: P3 signs only when identity, delay and lawyer approval all hold", () => {
  async function opened() {
    const w = await withSafe();
    const p1New = key();
    const recoveryId = randomUUID();
    await recoveryOpen(w.deps, { sqRef: w.sqRef, recoveryId, safeAddress: w.safe, newOwnerAddress: p1New.address });
    const state = await w.chain.getSafeState(w.safe);
    const tx = swapOwnerTx({ safe: w.safe, owners: state.owners, oldOwner: w.p1.address, newOwner: p1New.address });
    const hash = safeTxHash({ safe: w.safe, tx, nonce: state.nonce });
    const lawyerSig = await w.p2.sign({ hash });
    const verify = (deps = w.deps) => identityVerify(deps, { recoveryId, selfie: "simulated", bankingAnswer: TEST_BANKING_ANSWER });
    return { ...w, p1New, recoveryId, tx, hash, lawyerSig, verify };
  }

  it("refuses to sign until the identity check passed", async () => {
    const r = await opened();
    expect(await code(nodeSign(r.deps, { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig }))).toBe("403 IDENTITY_NOT_VERIFIED");
  });
  it("refuses to sign during the safety delay, signs after it", async () => {
    const r = await opened();
    await r.verify();
    const during = r.at(10_000);
    expect(await code(nodeSign(during, { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig }))).toBe("403 DELAY_NOT_ELAPSED");
    expect(await code(nodeSign(r.at(16_000), { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig }))).toBe("no error");
  });
  it("refuses without the lawyer's approval: no signature, a stranger's signature, or a signature over another hash", async () => {
    const r = await opened();
    await r.verify();
    const later = r.at(121_000);
    const input = { recoveryId: r.recoveryId, safeTxHash: r.hash };
    expect(await code(nodeSign(later, input))).toBe("400 INVALID_INPUT");
    expect(await code(nodeSign(later, { ...input, p2Signature: await key().sign({ hash: r.hash }) }))).toBe("403 LAWYER_APPROVAL_REQUIRED");
    const other = safeTxHash({ safe: r.safe, tx: usdcTransferTx(USDC, key().address, 1n), nonce: 0n });
    expect(await code(nodeSign(later, { ...input, p2Signature: await r.p2.sign({ hash: other }) }))).toBe("403 LAWYER_APPROVAL_REQUIRED");
  });
  it("refuses a hash it did not build itself", async () => {
    const r = await opened();
    await r.verify();
    const evil = safeTxHash({ safe: r.safe, tx: usdcTransferTx(USDC, key().address, 1n), nonce: 0n });
    expect(await code(nodeSign(r.at(121_000), { recoveryId: r.recoveryId, safeTxHash: evil, p2Signature: await r.p2.sign({ hash: evil }) }))).toBe("409 HASH_MISMATCH");
  });
  it("end to end: P2 + P3 swap the client key, same address, old key loses control, new key works", async () => {
    const r = await opened();
    await r.verify();
    const later = r.at(121_000);
    const p3 = await nodeSign(later, { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig });
    expect(p3.signer.toLowerCase()).toBe(r.p3.toLowerCase());
    const signatures = packSignatures([{ signer: r.p2.address, signature: r.lawyerSig }, { signer: p3.signer, signature: p3.signature }]);
    expect(await code(recoveryExecuted(later, { recoveryId: r.recoveryId, txHash: `0x${"1".repeat(64)}` }))).toBe("409 NOT_EXECUTED_YET");
    const { txHash } = await gasExec(later, execBody(r.safe, r.tx, signatures));
    expect(await recoveryExecuted(later, { recoveryId: r.recoveryId, txHash })).toEqual({ done: true });
    expect(await recoveryStatus(later, { recoveryId: r.recoveryId })).toMatchObject({ executed: true, p3Signed: true, safeAddress: r.safe.toLowerCase() });

    const owners = (await r.chain.getSafeState(r.safe)).owners.map((o) => o.toLowerCase());
    expect(owners).toContain(r.p1New.address.toLowerCase());
    expect(owners).not.toContain(r.p1.address.toLowerCase());
    // The old client key plus the lawyer can no longer move funds; the new key plus the lawyer can.
    const pay = usdcTransferTx(USDC, key().address, 10n);
    const hash = safeTxHash({ safe: r.safe, tx: pay, nonce: 1n });
    expect(await code(gasExec(later, execBody(r.safe, pay, await sigs(hash, [r.p1, r.p2]))))).toBe("422 EXECUTION_REVERTED");
    expect(await code(gasExec(later, execBody(r.safe, pay, await sigs(hash, [r.p1New, r.p2]))))).toBe("no error");
    // A used recovery cannot be signed twice.
    expect(await code(nodeSign(later, { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig }))).toBe("403 RECOVERY_ALREADY_USED");
  });
  it("attacker with the stolen phone and e-mail: the console sets the check to fail, nothing is signed, the old key keeps control", async () => {
    const r = await opened();
    await consoleIdentityOutcome(r.deps, { clientId: "client.lea", outcome: "fail" });
    expect(await r.verify()).toEqual({ verified: false, releaseAfter: null, simulated: true });
    expect(await recoveryStatus(r.deps, { recoveryId: r.recoveryId })).toMatchObject({ identityFailed: true, p3Signed: false });
    // Even with a lawyer who approved and a long wait, P3 stays closed.
    expect(await code(nodeSign(r.at(10 * 60_000), { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig }))).toBe("403 IDENTITY_NOT_VERIFIED");
    expect((await r.chain.getSafeState(r.safe)).owners.map((o) => o.toLowerCase())).toContain(r.p1.address.toLowerCase());
    const actions = (await consoleOperatorActions(r.deps)).actions;
    expect(actions[0]).toMatchObject({ action: "IDENTITY_OUTCOME_SET", detail: { outcome: "fail" } });
    const pay = usdcTransferTx(USDC, key().address, 10n);
    expect(await code(gasExec(r.deps, execBody(r.safe, pay, await sigs(safeTxHash({ safe: r.safe, tx: pay, nonce: 0n }), [r.p1, r.p2]))))).toBe("no error");
  });
  it("the client can cancel during the delay, and P3 then refuses", async () => {
    const r = await opened();
    await r.verify();
    await recoveryCancel(r.deps, { recoveryId: r.recoveryId });
    expect(await code(nodeSign(r.at(121_000), { recoveryId: r.recoveryId, safeTxHash: r.hash, p2Signature: r.lawyerSig }))).toBe("403 RECOVERY_CANCELLED");
  });
  it("the new phone's key can be attached after the identity check, once, and P3 never signs without it", async () => {
    const w = await withSafe();
    const recoveryId = randomUUID();
    await recoveryOpen(w.deps, { sqRef: w.sqRef, recoveryId, safeAddress: w.safe });
    await identityVerify(w.deps, { recoveryId, selfie: "simulated", bankingAnswer: TEST_BANKING_ANSWER });
    const later = w.at(121_000);
    expect(await code(nodeSign(later, { recoveryId, safeTxHash: `0x${"1".repeat(64)}`, p2Signature: `0x${"2".repeat(130)}` }))).toBe("409 NOT_A_WALLET_RECOVERY");
    const p1New = key();
    expect(await recoveryAttach(w.deps, { recoveryId, newOwnerAddress: p1New.address })).toEqual({ attached: true });
    expect(await recoveryAttach(w.deps, { recoveryId, newOwnerAddress: p1New.address })).toEqual({ attached: true });
    expect(await code(recoveryAttach(w.deps, { recoveryId, newOwnerAddress: key().address }))).toBe("409 NEW_OWNER_SET");
    const state = await w.chain.getSafeState(w.safe);
    const tx = swapOwnerTx({ safe: w.safe, owners: state.owners, oldOwner: w.p1.address, newOwner: p1New.address });
    const hash = safeTxHash({ safe: w.safe, tx, nonce: state.nonce });
    expect(await code(nodeSign(later, { recoveryId, safeTxHash: hash, p2Signature: await w.p2.sign({ hash }) }))).toBe("no error");
  });
  it("opens only for the client's own wallet and only for a key that is not an owner yet", async () => {
    const w = await withSafe();
    expect(await code(recoveryOpen(w.deps, { sqRef: w.sqRef, recoveryId: randomUUID(), safeAddress: key().address, newOwnerAddress: key().address }))).toBe("404 UNKNOWN_SAFE");
    expect(await code(recoveryOpen(w.deps, { sqRef: w.sqRef, recoveryId: randomUUID(), safeAddress: w.safe, newOwnerAddress: w.p2.address }))).toBe("409 ALREADY_OWNER");
    const id = randomUUID();
    await recoveryOpen(w.deps, { sqRef: w.sqRef, recoveryId: id, safeAddress: w.safe, newOwnerAddress: key().address });
    expect(await code(recoveryOpen(w.deps, { sqRef: w.sqRef, recoveryId: id, safeAddress: w.safe, newOwnerAddress: key().address }))).toBe("409 RECOVERY_EXISTS");
  });
});
