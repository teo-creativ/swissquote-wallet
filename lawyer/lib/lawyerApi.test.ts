import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./lawyerApi";
import { resetMock } from "./lawyerApi.mock";

// Every call waits on timers (read latency, simulated passkey prompt): run them with fake time.
async function done<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  await vi.advanceTimersByTimeAsync(2000);
  const r = await settled;
  if (!r.ok) throw r.e;
  return r.v;
}

beforeEach(() => {
  vi.useFakeTimers();
  resetMock();
});
afterEach(() => vi.useRealTimers());

describe("seed data", () => {
  it("has 2 clients and the requested pending requests", async () => {
    expect(await done(api.getClients())).toHaveLength(2);
    const pending = await done(api.getRequests("pending"));
    expect(pending.map((r) => r.kind).sort()).toEqual(["exit", "recovery", "transfer", "transfer"]);
    expect(await done(api.getMe())).toMatchObject({ clients: 2, pendingRequests: 4 });
  });

  it("has a 20-entry journal with integrity OK and only totals for automatic decisions", async () => {
    const j = await done(api.getJournal(100));
    expect(j.entries).toHaveLength(20);
    expect(j.entries[0].seq).toBe(20);
    expect(j.integrity).toEqual({ ok: true, checkedEntries: 20 });
    expect(j.autoDecisions24h).toEqual({ count: 14, totalUsdc: "37.00" });
    expect(await done(api.verifyAudit())).toEqual({ ok: true, checkedEntries: 20 });
  });

  it("respects the journal limit", async () => {
    expect(await done(api.getJournal(5))).toHaveProperty("entries.length", 5);
  });
});

describe("decide", () => {
  it("approves a transfer, updates the list and the counter, and adds the recipient when asked", async () => {
    const before = await done(api.getRequest("req_01"));
    expect(before.recipientKnown).toBe(false);
    await done(api.decide("req_01", "approve", { addRecipient: true }));
    const after = await done(api.getRequest("req_01"));
    expect(after.status).toBe("approved");
    expect(after.recipientKnown).toBe(true);
    expect((await done(api.getMe())).pendingRequests).toBe(3);
    expect((await done(api.getJournal(2))).entries.map((e) => e.type)).toEqual(["RECIPIENT_ADDED", "LAWYER_DECIDED"]);
  });

  it("does not add the recipient unless asked", async () => {
    await done(api.decide("req_02", "approve"));
    expect((await done(api.getRequest("req_02"))).recipientKnown).toBe(false);
  });

  it("refuses a transfer", async () => {
    await done(api.decide("req_01", "refuse"));
    expect((await done(api.getRequests("refused"))).map((r) => r.id)).toContain("req_01");
  });

  it("rejects a second decision and unknown ids", async () => {
    await done(api.decide("req_02", "refuse"));
    await expect(done(api.decide("req_02", "approve"))).rejects.toMatchObject({ code: "REQUEST_NOT_PENDING" });
    await expect(done(api.decide("nope", "approve"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("takes about 800 ms (simulated passkey prompt)", async () => {
    let finished = false;
    const p = api.decide("req_02", "approve").then(() => (finished = true));
    await vi.advanceTimersByTimeAsync(799);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(finished).toBe(true);
  });

  it("starts the 2-minute waiting period on a recovery, which can then be cancelled", async () => {
    await done(api.decide("req_03", "approve"));
    const r = await done(api.getRequest("req_03"));
    expect(r.status).toBe("approved");
    expect(Date.parse(r.recovery!.delayEndsAt!) - Date.now()).toBeGreaterThan(100_000);
    expect(r.recovery!.timeline.map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
    expect((await done(api.getClients())).find((c) => c.id === "client.lea")?.status).toBe("recovering");

    await done(api.decide("req_03", "refuse")); // Cancel recovery
    const cancelled = await done(api.getRequest("req_03"));
    expect(cancelled.status).toBe("refused");
    expect(cancelled.recovery!.timeline[2].state).toBe("failed");
    expect((await done(api.getClients())).find((c) => c.id === "client.lea")?.status).toBe("active");
  });

  it("completes the timeline when the waiting period ends, and then it can no longer be cancelled", async () => {
    await done(api.decide("req_03", "approve"));
    await vi.advanceTimersByTimeAsync(121_000);
    const r = await done(api.getRequest("req_03"));
    expect(r.status).toBe("approved");
    expect(r.recovery!.timeline.every((s) => s.state === "done")).toBe(true);
    expect((await done(api.getClients())).find((c) => c.id === "client.lea")?.status).toBe("active");
    await expect(done(api.decide("req_03", "refuse"))).rejects.toMatchObject({ code: "REQUEST_NOT_PENDING" });
  });

  it("handles an exit request the same way, without an identity check", async () => {
    const r = await done(api.getRequest("req_04"));
    expect(r.kind).toBe("exit");
    expect(r.recovery?.identity).toBeUndefined();
    await done(api.decide("req_04", "approve"));
    expect((await done(api.getRequest("req_04"))).recovery?.delayEndsAt).toBeDefined();
  });

  it("expires pending requests after their deadline", async () => {
    await vi.advanceTimersByTimeAsync(49 * 3_600_000);
    expect((await done(api.getRequests("pending"))).length).toBe(0);
    await expect(done(api.decide("req_01", "approve"))).rejects.toMatchObject({ code: "REQUEST_EXPIRED" });
  });
});

describe("policy", () => {
  it("saves a change, bumps the version and journals it", async () => {
    const p = await done(api.getPolicy("client.lea"));
    expect(p.version).toBe(3);
    await done(api.updatePolicy("client.lea", { ...p, perTxCap: "8", approvedRecipients: [] }));
    const next = await done(api.getPolicy("client.lea"));
    expect(next).toMatchObject({ perTxCap: "8.00", version: 4, approvedRecipients: [] });
    const types = (await done(api.getJournal(3))).entries.map((e) => e.type);
    expect(types).toContain("POLICY_CHANGED");
    expect(types.filter((t) => t === "RECIPIENT_REVOKED")).toHaveLength(2);
  });

  it("shows every new version in the history, including a recipients-only change", async () => {
    const policyEntries = async () => (await done(api.getJournal(200))).entries.filter((e) => e.type === "POLICY_CHANGED" && e.clientName === "Léa Martin");
    const before = await policyEntries();
    expect(before[0].summary).toMatch(/^Policy v3 saved/);

    const p = await done(api.getPolicy("client.lea"));
    await done(api.updatePolicy("client.lea", { ...p, approvedRecipients: [p.approvedRecipients[0]] }));
    await done(api.updatePolicy("client.lea", { ...(await done(api.getPolicy("client.lea"))), dailyCount: 8 }));

    const after = await policyEntries();
    expect(after).toHaveLength(before.length + 2);
    expect(after[0].summary).toMatch(/^Policy v5 saved: Transfers per day 6 → 8/);
    expect(after[1].summary).toMatch(/^Policy v4 saved: 1 recipient\(s\) revoked/);
    expect((await done(api.getClients())).find((c) => c.id === "client.lea")?.policyVersion).toBe(5);
  });

  it("does nothing when nothing changed", async () => {
    const p = await done(api.getPolicy("client.lea"));
    await done(api.updatePolicy("client.lea", p));
    expect((await done(api.getPolicy("client.lea"))).version).toBe(3);
  });

  it("rejects invalid input and stale versions", async () => {
    const p = await done(api.getPolicy("client.lea"));
    await expect(done(api.updatePolicy("client.lea", { ...p, perTxCap: "abc" }))).rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(done(api.updatePolicy("client.lea", { ...p, version: 1, hourlyCount: 1 }))).rejects.toMatchObject({
      code: "POLICY_VERSION_CONFLICT",
    });
    await expect(done(api.getPolicy("nobody"))).rejects.toMatchObject({ code: "CLIENT_NOT_FOUND" });
  });
});

describe("invitation", () => {
  it("accepts any token except expired and used", async () => {
    expect((await done(api.inspectInvitation("abc"))).valid).toBe(true);
    expect((await done(api.inspectInvitation("expired"))).valid).toBe(false);
  });
});
