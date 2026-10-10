// Test helpers: in-memory store, fake chain, fixed clock. Not imported by any route.
import type { Address, Hex } from "viem";
import type { Chain } from "./chain";
import { readConfig } from "./config";
import { seedDemoData } from "./seed";
import type { Deps } from "./services";
import { MemoryStore } from "./store";

export const T0 = new Date("2026-10-11T02:00:00.000Z");
export const TEST_PASSWORD = "pw-for-tests-only";
export const TEST_BANKING_ANSWER = "answer-for-tests-only";

export class FakeChain implements Chain {
  balance = 0n;
  gasSent: { to: Address; amountWei: bigint }[] = [];
  usdcSent: { to: Address; amount: bigint }[] = [];
  async getEthBalance() { return this.balance; }
  async sendGas(to: Address, amountWei: bigint) { this.gasSent.push({ to, amountWei }); return `0x${"a".repeat(64)}` as Hex; }
  async sendUsdc(to: Address, amount: bigint) { this.usdcSent.push({ to, amount }); return `0x${"b".repeat(64)}` as Hex; }
}

export async function testDeps(now: Date = T0) {
  const store = new MemoryStore();
  await seedDemoData(store, TEST_PASSWORD);
  const chain = new FakeChain();
  const config = { ...readConfig({ SQ_DEMO_BANKING_ANSWER: TEST_BANKING_ANSWER }), kycDelayMs: 0 };
  const slept: number[] = [];
  const deps: Deps = { store, chain, config, now, sleep: async (ms) => { slept.push(ms); } };
  const lea = (await store.getClient("client.lea"))!;
  const demo = (await store.getClient("client.demo"))!;
  return { deps, store, chain, slept, lea, demo, at: (ms: number): Deps => ({ ...deps, now: new Date(now.getTime() + ms) }) };
}
