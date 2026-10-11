// Test helpers: in-memory store, fake chain (including a small Safe 2-of-3 simulator), fixed clock. Not imported by any route.
import { randomBytes } from "node:crypto";
import { decodeFunctionData, getAddress, recoverAddress, type Address, type Hex } from "viem";
import { SAFE_THRESHOLD, predictSafeAddress, safeAbi, safeTxHash, type SafeTx } from "../src/shared/safe";
import type { Chain, SafeState } from "./chain";
import { readConfig } from "./config";
import { ApiError } from "./errors";
import { seedDemoData } from "./seed";
import type { Deps } from "./services";
import { MemoryStore } from "./store";

export const T0 = new Date("2026-10-11T02:00:00.000Z");
export const TEST_PASSWORD = "pw-for-tests-only";
export const TEST_BANKING_ANSWER = "answer-for-tests-only";
const FAKE_CREATION_CODE = "0x608060405234801561001057600080fd5b50" as Hex;

let hashCounter = 0;
const fakeHash = (): Hex => `0x${(++hashCounter).toString(16).padStart(64, "0")}`;

export class FakeChain implements Chain {
  balance = 0n;
  sponsorWei = 1_000_000_000_000_000_000n;
  gasSent: { to: Address; amountWei: bigint }[] = [];
  usdcSent: { to: Address; amount: bigint }[] = [];
  deployed = new Map<string, { owners: Address[]; nonce: bigint }>();
  executed: { safe: Address; tx: SafeTx; txHash: Hex }[] = [];
  deployCalls = 0;
  async getEthBalance() { return this.balance; }
  async sendGas(to: Address, amountWei: bigint) { this.gasSent.push({ to, amountWei }); return `0x${"a".repeat(64)}` as Hex; }
  async sendUsdc(to: Address, amount: bigint) { this.usdcSent.push({ to, amount }); return `0x${"b".repeat(64)}` as Hex; }

  async getCode(address: Address) { return this.deployed.has(address.toLowerCase()) ? ("0x6080" as Hex) : undefined; }
  async proxyCreationCode() { return FAKE_CREATION_CODE; }
  async sponsorBalance() { return this.sponsorWei; }
  async getSafeState(safe: Address): Promise<SafeState> {
    const s = this.deployed.get(safe.toLowerCase());
    if (!s) throw new Error("no such safe");
    return { owners: [...s.owners], nonce: s.nonce, threshold: SAFE_THRESHOLD };
  }
  async deploySafe({ owners, saltNonce }: { owners: readonly Address[]; saltNonce: bigint }) {
    this.deployCalls++;
    const address = predictSafeAddress({ owners, saltNonce, proxyCreationCode: FAKE_CREATION_CODE });
    this.deployed.set(address.toLowerCase(), { owners: [...owners], nonce: 0n });
    return fakeHash();
  }
  /** Same acceptance rule as the Safe contract: at least two distinct owner signatures over the safeTxHash. */
  async execSafe({ safe, tx, signatures }: { safe: Address; tx: SafeTx; signatures: Hex }) {
    const s = this.deployed.get(safe.toLowerCase());
    if (!s) throw new ApiError(422, "EXECUTION_REVERTED", "The transaction would fail on chain. Nothing was sent.");
    const hash = safeTxHash({ safe, tx, nonce: s.nonce });
    const seen = new Set<string>();
    for (let i = 0; i < (signatures.length - 2) / 130; i++) {
      const sig = `0x${signatures.slice(2 + i * 130, 2 + (i + 1) * 130)}` as Hex;
      const signer = (await recoverAddress({ hash, signature: sig }).catch(() => null))?.toLowerCase();
      if (signer && s.owners.some((o) => o.toLowerCase() === signer)) seen.add(signer);
    }
    if (seen.size < SAFE_THRESHOLD) throw new ApiError(422, "EXECUTION_REVERTED", "The transaction would fail on chain. Nothing was sent.");
    if (getAddress(tx.to) === getAddress(safe)) {
      const { functionName, args } = decodeFunctionData({ abi: safeAbi, data: tx.data });
      if (functionName === "swapOwner") {
        const [, oldOwner, newOwner] = args as [Address, Address, Address];
        s.owners = s.owners.map((o) => (o.toLowerCase() === oldOwner.toLowerCase() ? newOwner : o));
      }
    }
    s.nonce += 1n;
    const txHash = fakeHash();
    this.executed.push({ safe, tx, txHash });
    return txHash;
  }
}

export async function testDeps(now: Date = T0) {
  const store = new MemoryStore();
  await seedDemoData(store, TEST_PASSWORD);
  const chain = new FakeChain();
  const env = { SQ_SHARE_ENC_KEY: randomBytes(32).toString("hex"), SQ_SHARE_ENC_KEY_VERSION: "1" };
  const config = { ...readConfig({ SQ_DEMO_BANKING_ANSWER: TEST_BANKING_ANSWER }), kycDelayMs: 0 };
  const slept: number[] = [];
  const deps: Deps = { store, chain, config, now, env, sleep: async (ms) => { slept.push(ms); } };
  const lea = (await store.getClient("client.lea"))!;
  const demo = (await store.getClient("client.demo"))!;
  return { deps, store, chain, slept, lea, demo, at: (ms: number): Deps => ({ ...deps, now: new Date(now.getTime() + ms) }) };
}
