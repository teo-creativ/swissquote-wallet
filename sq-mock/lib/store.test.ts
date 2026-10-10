import { describe, expect, it } from "vitest";
import { appendAudit, AUDIT_GENESIS_HASH, verifyAuditChain } from "./audit";
import { hashPassword, verifyPassword } from "./passwords";
import { DEMO_CASH_CHF, DEMO_SANCTIONED_ADDRESSES, seedDemoData } from "./seed";
import { MemoryStore } from "./store";

const now = new Date("2026-10-11T02:00:00.000Z");

describe("passwords", () => {
  it("verifies the right password only and never stores it in clear", () => {
    const hash = hashPassword("correct horse");
    expect(hash).not.toContain("correct horse");
    expect(verifyPassword("correct horse", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("correct horse", "plain")).toBe(false);
  });
});

describe("seed", () => {
  it("creates two clients with hashed passwords, a CHF balance and KYC not verified", async () => {
    const store = new MemoryStore();
    expect(await seedDemoData(store, "pw-for-test")).toEqual(["client.lea", "client.demo"]);
    const clients = await store.listClients();
    expect(clients).toHaveLength(2);
    for (const c of clients) {
      expect(c.kycStatus).toBe("none");
      expect(c.cashChf).toBe(DEMO_CASH_CHF);
      expect(c.identityOutcome).toBe("pass");
      expect(c.passwordHash.startsWith("scrypt$")).toBe(true);
      expect(verifyPassword("pw-for-test", c.passwordHash)).toBe(true);
      expect(c.sqRef).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(await store.getSanction(DEMO_SANCTIONED_ADDRESSES[0])).not.toBeNull();
  });

  it("is idempotent and creates no client without a demo password", async () => {
    const store = new MemoryStore();
    expect(await seedDemoData(store, undefined)).toEqual([]);
    await seedDemoData(store, "a");
    const before = await store.getClient("client.lea");
    expect(await seedDemoData(store, "b")).toEqual([]);
    expect(await store.getClient("client.lea")).toEqual(before);
  });
});

describe("memory store", () => {
  it("claims a nonce once", async () => {
    const store = new MemoryStore();
    expect(await store.claim("n1", now)).toBe(true);
    expect(await store.claim("n1", now)).toBe(false);
  });

  it("returns the most recent link of a client", async () => {
    const store = new MemoryStore();
    await store.addLink({ clientId: "c", address: "0xa", linkedAt: "2026-10-11T01:00:00.000Z" });
    await store.addLink({ clientId: "c", address: "0xb", linkedAt: "2026-10-11T02:00:00.000Z" });
    expect((await store.getLatestLink("c"))?.address).toBe("0xb");
    expect((await store.getLinkByAddress("0xa"))?.clientId).toBe("c");
  });
});

describe("audit log", () => {
  it("chains entries and detects tampering", async () => {
    const store = new MemoryStore();
    await Promise.all([
      appendAudit(store, "A", { n: 1 }, now),
      appendAudit(store, "B", { n: 2 }, now),
      appendAudit(store, "C", { n: 3 }, now),
    ]);
    const entries = await store.listAudit();
    expect(entries.map((e) => e.action)).toEqual(["A", "B", "C"]);
    expect(entries[0].prevHash).toBe(AUDIT_GENESIS_HASH);
    expect(entries[1].prevHash).toBe(entries[0].entryHash);
    expect(verifyAuditChain(entries)).toBeNull();
    const tampered = entries.map((e, i) => (i === 1 ? { ...e, payload: { n: 99 } } : e));
    expect(verifyAuditChain(tampered)).toBe(entries[1].id);
    expect(verifyAuditChain([entries[0], entries[2]])).toBe(entries[2].id);
  });
});
