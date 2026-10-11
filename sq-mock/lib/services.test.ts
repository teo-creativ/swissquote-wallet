import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyAuditChain } from "./audit";
import { ApiError } from "./errors";
import { DEMO_SANCTIONED_ADDRESSES } from "./seed";
import {
  alertsCall, bankAccount, complianceAlert, complianceScreen, gasDrip, kyc, login, ownershipProof, resolveAccount, transferToWallet,
  type Deps,
} from "./services";
import { T0, TEST_PASSWORD, testDeps } from "./testkit";

// Throwaway keys generated for each run. They never hold funds.
const wallet = privateKeyToAccount(generatePrivateKey());
const otherWallet = privateKeyToAccount(generatePrivateKey());

const proofMessage = (address: string, sqRef: string, date: Date) => `I confirm I own the wallet ${address}. Client ${sqRef}. ${date.toISOString()}.`;

async function proofInput(sqRef: string, date: Date = T0, signer = wallet, address: string = wallet.address) {
  const message = proofMessage(address, sqRef, date);
  return { sqRef, address, message, signature: await signer.signMessage({ message }) };
}
async function link(deps: Deps, sqRef: string, signer = wallet) {
  expect(await ownershipProof(deps, await proofInput(sqRef, deps.now, signer, signer.address))).toEqual({ verified: true, method: "ECDSA" });
}
async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof ApiError) return `${e.status} ${e.code}`; throw e; }
  return "no error";
}

describe("login, kyc, bank account", () => {
  it("logs in with the demo password and returns only the pseudonymous reference", async () => {
    const { deps, lea } = await testDeps();
    const res = await login(deps, { clientId: "client.lea", password: TEST_PASSWORD });
    expect(res).toEqual({ sqRef: lea.sqRef, displayName: "Léa", kycStatus: "none", simulated: true });
    expect(JSON.stringify(res)).not.toContain("scrypt");
    expect((await login(deps, { clientId: "client.lea", password: TEST_PASSWORD })).sqRef).toBe(lea.sqRef);
  });

  it("rejects a wrong password and an unknown client the same way", async () => {
    const { deps } = await testDeps();
    expect(await code(login(deps, { clientId: "client.lea", password: "nope" }))).toBe("401 INVALID_CREDENTIALS");
    expect(await code(login(deps, { clientId: "client.ghost", password: TEST_PASSWORD }))).toBe("401 INVALID_CREDENTIALS");
    expect(await code(login(deps, { clientId: "client.lea" }))).toBe("400 INVALID_INPUT");
  });

  it("verifies KYC after the simulated 2 s delay and says it is simulated", async () => {
    const { deps, store, slept, lea } = await testDeps();
    const res = await kyc({ ...deps, config: { ...deps.config, kycDelayMs: 2000 } }, { sqRef: lea.sqRef });
    expect(res).toEqual({ kycStatus: "verified", simulated: true });
    expect(slept).toEqual([2000]);
    expect((await store.getClient("client.lea"))?.kycStatus).toBe("verified");
    expect(await code(kyc(deps, { sqRef: "00000000-0000-4000-8000-000000000000" }))).toBe("404 UNKNOWN_CLIENT");
  });

  it("returns the simulated CHF balance", async () => {
    const { deps, lea } = await testDeps();
    expect(await bankAccount(deps, { sqRef: lea.sqRef })).toEqual({ cashChf: 18165, simulated: true });
  });
});

describe("ownership proof", () => {
  it("accepts a good signature, stores the proof and links the address to the client", async () => {
    const { deps, store, lea } = await testDeps();
    expect(await code(resolveAccount(deps, { sqRef: lea.sqRef }))).toBe("404 NO_WALLET_LINKED");
    await link(deps, lea.sqRef);
    expect(await resolveAccount(deps, { sqRef: lea.sqRef })).toEqual({ address: wallet.address });
    expect((await store.listProofs())[0]).toMatchObject({ clientId: "client.lea", verified: true, method: "ECDSA" });
    await link(deps, lea.sqRef); // same client, same address: idempotent
    expect(await store.listLinks()).toHaveLength(1);
  });

  it("rejects a signature made by another key and creates no link", async () => {
    const { deps, store, lea } = await testDeps();
    const res = await ownershipProof(deps, await proofInput(lea.sqRef, T0, otherWallet));
    expect(res).toEqual({ verified: false, method: "ECDSA" });
    expect(await store.listLinks()).toHaveLength(0);
    expect((await store.listProofs())[0].verified).toBe(false);
  });

  it("rejects a date older than 10 minutes or in the future", async () => {
    const { deps, lea } = await testDeps();
    const old = new Date(T0.getTime() - 10 * 60_000 - 1000);
    expect(await code(ownershipProof(deps, await proofInput(lea.sqRef, old)))).toBe("410 PROOF_EXPIRED");
    const almost = new Date(T0.getTime() - 9 * 60_000);
    expect((await ownershipProof(deps, await proofInput(lea.sqRef, almost))).verified).toBe(true);
    const future = new Date(T0.getTime() + 5 * 60_000);
    expect(await code(ownershipProof(deps, await proofInput(lea.sqRef, future)))).toBe("400 INVALID_DATE");
  });

  it("rejects a wrong address, a wrong client reference and a message off the template", async () => {
    const { deps, lea, demo } = await testDeps();
    const good = await proofInput(lea.sqRef);
    expect(await code(ownershipProof(deps, { ...good, address: otherWallet.address }))).toBe("400 ADDRESS_MISMATCH");
    expect(await code(ownershipProof(deps, { ...good, sqRef: demo.sqRef }))).toBe("400 CLIENT_MISMATCH");
    const message = `${good.message} Extra`;
    expect(await code(ownershipProof(deps, { ...good, message, signature: await wallet.signMessage({ message }) }))).toBe("400 INVALID_MESSAGE");
    expect(await code(ownershipProof(deps, { ...good, signature: "0x1234" }))).toBe("400 INVALID_INPUT");
  });

  it("refuses to link an address already linked to another client", async () => {
    const { deps, lea, demo } = await testDeps();
    await link(deps, lea.sqRef);
    expect(await code(ownershipProof(deps, await proofInput(demo.sqRef)))).toBe("409 ADDRESS_ALREADY_LINKED");
  });
});

describe("transfer to wallet", () => {
  it("needs a verified ownership proof", async () => {
    const { deps, chain, lea } = await testDeps();
    expect(await code(transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: "1000000" }))).toBe("403 OWNERSHIP_PROOF_REQUIRED");
    expect(chain.usdcSent).toHaveLength(0);
  });

  it("sends USDC to the linked address and debits CHF at 0.88", async () => {
    const { deps, store, chain, lea } = await testDeps();
    await link(deps, lea.sqRef);
    const res = await transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: "5000000" });
    expect(res).toMatchObject({ debitedChf: 4.4, bankDebitSimulated: true });
    expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(chain.usdcSent).toEqual([{ to: wallet.address, amount: 5_000_000n }]);
    expect((await store.getClient("client.lea"))?.cashChf).toBe(18160.6);
  });

  it("caps a transfer at 10 USDC and validates the amount", async () => {
    const { deps, chain, lea } = await testDeps();
    await link(deps, lea.sqRef);
    expect(await code(transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: "10000001" }))).toBe("400 AMOUNT_ABOVE_LIMIT");
    for (const bad of ["0", "-1", "1.5", "abc", 5])
      expect(await code(transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: bad }))).toBe("400 INVALID_INPUT");
    expect(chain.usdcSent).toHaveLength(0);
    await transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: "10000000" });
    expect(chain.usdcSent).toHaveLength(1);
  });

  it("allows 3 transfers per 24 hours, then again once the window has passed", async () => {
    const { deps, chain, lea, at } = await testDeps();
    await link(deps, lea.sqRef);
    for (let i = 0; i < 3; i++) await transferToWallet(at(i * 1000), { sqRef: lea.sqRef, amountUsdc: "1000000" });
    expect(await code(transferToWallet(at(5000), { sqRef: lea.sqRef, amountUsdc: "1000000" }))).toBe("429 DAILY_LIMIT_REACHED");
    expect(chain.usdcSent).toHaveLength(3);
    await transferToWallet(at(24 * 3600_000 + 1500), { sqRef: lea.sqRef, amountUsdc: "1000000" });
    expect(chain.usdcSent).toHaveLength(4);
  });

  it("refuses when the cash balance is too low", async () => {
    const { deps, store, chain, lea } = await testDeps();
    await link(deps, lea.sqRef);
    await store.updateClient("client.lea", { cashChf: 1 });
    expect(await code(transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: "5000000" }))).toBe("409 INSUFFICIENT_FUNDS");
    expect(chain.usdcSent).toHaveLength(0);
  });
});

describe("gas drip (CDC 3.6)", () => {
  it("skips an address that is not linked to a client", async () => {
    const { deps, chain } = await testDeps();
    expect(await gasDrip(deps, { address: wallet.address })).toEqual({ skipped: "UNKNOWN_ADDRESS" });
    expect(chain.gasSent).toHaveLength(0);
    expect(await code(gasDrip(deps, { address: "0x123" }))).toBe("400 INVALID_INPUT");
  });

  it("sends the fixed 0.0003 ETH once per address per 24 hours", async () => {
    const { deps, chain, lea, at } = await testDeps();
    await link(deps, lea.sqRef);
    expect(await gasDrip(deps, { address: wallet.address })).toHaveProperty("txHash");
    expect(chain.gasSent).toEqual([{ to: wallet.address, amountWei: 300_000_000_000_000n }]);
    expect(await gasDrip(at(3600_000), { address: wallet.address.toLowerCase() })).toEqual({ skipped: "ALREADY_DRIPPED_24H" });
    expect(await gasDrip(at(24 * 3600_000 + 1000), { address: wallet.address })).toHaveProperty("txHash");
    expect(chain.gasSent).toHaveLength(2);
  });

  it("skips when the balance is at or above the threshold", async () => {
    const { deps, chain, lea } = await testDeps();
    await link(deps, lea.sqRef);
    chain.balance = 100_000_000_000_000n;
    expect(await gasDrip(deps, { address: wallet.address })).toEqual({ skipped: "BALANCE_ABOVE_THRESHOLD" });
    chain.balance = 99_999_999_999_999n;
    expect(await gasDrip(deps, { address: wallet.address })).toHaveProperty("txHash");
  });

  it("enforces the global daily cap", async () => {
    const { deps, chain, lea, demo } = await testDeps();
    const capped = { ...deps, config: { ...deps.config, gasDripDailyCap: 1 } };
    await link(deps, lea.sqRef);
    await link(deps, demo.sqRef, otherWallet);
    expect(await gasDrip(capped, { address: wallet.address })).toHaveProperty("txHash");
    expect(await gasDrip(capped, { address: otherWallet.address })).toEqual({ skipped: "DAILY_CAP_REACHED" });
    expect(chain.gasSent).toHaveLength(1);
  });

  it("refuses a sanctioned address", async () => {
    const { deps, store, chain, lea } = await testDeps();
    await link(deps, lea.sqRef);
    await store.addSanction(wallet.address.toLowerCase(), "test");
    expect(await gasDrip(deps, { address: wallet.address })).toEqual({ skipped: "SANCTIONED_ADDRESS" });
    expect(await code(transferToWallet(deps, { sqRef: lea.sqRef, amountUsdc: "1000000" }))).toBe("403 SANCTIONED_ADDRESS");
    expect(chain.gasSent).toHaveLength(0);
  });
});

describe("compliance and alerts", () => {
  it("screens against the simulated list", async () => {
    const { deps } = await testDeps();
    expect(await complianceScreen(deps, { address: DEMO_SANCTIONED_ADDRESSES[0] })).toMatchObject({ sanctioned: true, simulated: true });
    expect(await complianceScreen(deps, { address: wallet.address })).toMatchObject({ sanctioned: false, simulated: true });
  });

  it("logs alerts and simulated calls, each with an audit entry", async () => {
    const { deps, store, lea } = await testDeps();
    expect(await complianceAlert(deps, { account: lea.sqRef, target: DEMO_SANCTIONED_ADDRESSES[0], reason: "SANCTIONED_ADDRESS" })).toEqual({ logged: true });
    expect(await alertsCall(deps, { sqRef: lea.sqRef, reason: "Recovery requested" })).toEqual({ logged: true, simulated: true });
    expect(await store.listComplianceAlerts()).toHaveLength(1);
    expect((await store.listCalls())[0]).toMatchObject({ clientId: "client.lea", reason: "Recovery requested" });
    const audit = await store.listAudit();
    expect(audit.map((e) => e.action)).toEqual(["COMPLIANCE_ALERT", "SIMULATED_CALL"]);
    expect(verifyAuditChain(audit)).toBeNull();
  });
});
