import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyAuditChain } from "./audit";
import {
  CONSOLE_HEADER, consoleClients, consoleIdentityOutcome, consolePasswordMatches, consoleRecoveries, consoleRoute,
} from "./console";
import { ApiError } from "./errors";
import { identityStart, identityVerify, recoveryCancel, recoveryStatus, releaseBlock } from "./recovery";
import { TEST_BANKING_ANSWER, TEST_PASSWORD, testDeps } from "./testkit";

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof ApiError) return `${e.status} ${e.code}`; throw e; }
  return "no error";
}
const good = (recoveryId: string) => ({ recoveryId, selfie: "simulated", bankingAnswer: TEST_BANKING_ANSWER });

describe("recovery identity check", () => {
  it("starts pending, then verifies with the right banking answer and sets release_after = verified + delay", async () => {
    const { deps, store, lea, at } = await testDeps();
    const recoveryId = randomUUID();
    expect(await identityStart(deps, { sqRef: lea.sqRef, recoveryId })).toEqual({ status: "pending", simulated: true });
    expect(await recoveryStatus(deps, { recoveryId })).toEqual({ identityVerified: false, identityFailed: false, releaseAfter: null, cancelled: false });
    expect(await code(identityStart(deps, { sqRef: lea.sqRef, recoveryId }))).toBe("409 RECOVERY_EXISTS");

    const verifiedAt = at(30_000);
    const res = await identityVerify(verifiedAt, good(recoveryId));
    const expectedRelease = new Date(verifiedAt.now.getTime() + 120_000).toISOString();
    expect(res).toEqual({ verified: true, releaseAfter: expectedRelease, simulated: true });
    expect(await recoveryStatus(deps, { recoveryId })).toMatchObject({ identityVerified: true, releaseAfter: expectedRelease, cancelled: false });
    expect((await store.getIdentityCheck(recoveryId))?.identityVerifiedAt).toBe(verifiedAt.now.toISOString());
    expect(await code(identityVerify(deps, good(recoveryId)))).toBe("409 IDENTITY_ALREADY_CHECKED");
  });

  it("uses RECOVERY_DELAY_SECONDS from the configuration", async () => {
    const { deps, lea } = await testDeps();
    const recoveryId = randomUUID();
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    const res = await identityVerify({ ...deps, config: { ...deps.config, recoveryDelaySeconds: 86400 } }, good(recoveryId));
    expect(res.releaseAfter).toBe(new Date(deps.now.getTime() + 86400_000).toISOString());
  });

  it("fails on a wrong banking answer, for good", async () => {
    const { deps, store, lea } = await testDeps();
    const recoveryId = randomUUID();
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    expect(await identityVerify(deps, { ...good(recoveryId), bankingAnswer: "wrong" })).toEqual({ verified: false, releaseAfter: null, simulated: true });
    expect(await recoveryStatus(deps, { recoveryId })).toMatchObject({ identityVerified: false, identityFailed: true, releaseAfter: null });
    expect(await code(identityVerify(deps, good(recoveryId)))).toBe("409 IDENTITY_ALREADY_CHECKED");
    expect(JSON.stringify(await store.listAudit())).not.toContain("wrong");
  });

  it("fails when the console set the next identity check to fail, even with the right answer", async () => {
    const { deps, lea } = await testDeps();
    const recoveryId = randomUUID();
    await consoleIdentityOutcome(deps, { clientId: "client.lea", outcome: "fail" });
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    expect((await identityVerify(deps, good(recoveryId))).verified).toBe(false);
  });

  it("fails closed when the demo banking answer is not configured", async () => {
    const { deps, lea } = await testDeps();
    const recoveryId = randomUUID();
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    const noAnswer = { ...deps, config: { ...deps.config, bankingAnswer: undefined } };
    expect((await identityVerify(noAnswer, good(recoveryId))).verified).toBe(false);
  });

  it("cancels, and a cancelled recovery cannot be verified", async () => {
    const { deps, lea } = await testDeps();
    const recoveryId = randomUUID();
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    expect(await recoveryCancel(deps, { recoveryId })).toEqual({ cancelled: true });
    expect(await recoveryCancel(deps, { recoveryId })).toEqual({ cancelled: true });
    expect((await recoveryStatus(deps, { recoveryId })).cancelled).toBe(true);
    expect(await code(identityVerify(deps, good(recoveryId)))).toBe("409 RECOVERY_CANCELLED");
    expect(await code(recoveryStatus(deps, { recoveryId: randomUUID() }))).toBe("404 UNKNOWN_RECOVERY");
    expect(await code(recoveryStatus(deps, { recoveryId: "nope" }))).toBe("400 INVALID_INPUT");
  });
});

describe("recovery release checks (used by the P3 node)", () => {
  it("blocks until the delay has elapsed, then releases once", async () => {
    const { deps, store, lea } = await testDeps();
    const recoveryId = randomUUID();
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    expect(releaseBlock((await store.getIdentityCheck(recoveryId))!, deps.now)).toBe("IDENTITY_NOT_VERIFIED");
    await identityVerify(deps, good(recoveryId));
    const check = (await store.getIdentityCheck(recoveryId))!;
    const t = deps.now.getTime();
    expect(releaseBlock(check, new Date(t))).toBe("DELAY_NOT_ELAPSED");
    expect(releaseBlock(check, new Date(t + 119_999))).toBe("DELAY_NOT_ELAPSED");
    expect(releaseBlock(check, new Date(t + 120_000))).toBeNull();
    expect(releaseBlock({ ...check, usedAt: new Date(t + 130_000).toISOString() }, new Date(t + 140_000))).toBe("RECOVERY_ALREADY_USED");
    expect(releaseBlock({ ...check, cancelledAt: new Date(t + 10_000).toISOString() }, new Date(t + 140_000))).toBe("RECOVERY_CANCELLED");
  });

  it("never releases a failed identity check", async () => {
    const { deps, store, lea } = await testDeps();
    const recoveryId = randomUUID();
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    await identityVerify(deps, { ...good(recoveryId), bankingAnswer: "wrong" });
    expect(releaseBlock((await store.getIdentityCheck(recoveryId))!, new Date(deps.now.getTime() + 86400_000))).toBe("IDENTITY_NOT_VERIFIED");
  });
});

describe("console", () => {
  const PASSWORD = "console-password-for-tests-only";
  const ORIGIN = "http://localhost:3002";
  beforeAll(() => {
    process.env.SQ_DEMO_PASSWORD = TEST_PASSWORD;
    delete process.env.SQ_SUPABASE_URL;
  });

  it("compares the password in constant time and fails closed", () => {
    expect(consolePasswordMatches(PASSWORD, PASSWORD)).toBe(true);
    expect(consolePasswordMatches("x", PASSWORD)).toBe(false);
    expect(consolePasswordMatches(null, PASSWORD)).toBe(false);
    expect(consolePasswordMatches("", "")).toBe(false);
    expect(consolePasswordMatches(PASSWORD, undefined)).toBe(false);
  });

  it("rejects requests without the right password, including when none is configured", async () => {
    const route = consoleRoute(consoleClients);
    process.env.CONSOLE_PASSWORD = PASSWORD;
    expect((await route(new Request(`${ORIGIN}/api/console/clients`))).status).toBe(401);
    expect((await route(new Request(`${ORIGIN}/api/console/clients`, { headers: { [CONSOLE_HEADER]: "wrong" } }))).status).toBe(401);
    const ok = await route(new Request(`${ORIGIN}/api/console/clients`, { headers: { [CONSOLE_HEADER]: PASSWORD } }));
    expect(ok.status).toBe(200);
    const body = JSON.stringify(await ok.json());
    expect(body).toContain("client.lea");
    expect(body).not.toContain("scrypt");
    expect(body).not.toContain("passwordHash");
    delete process.env.CONSOLE_PASSWORD;
    expect((await route(new Request(`${ORIGIN}/api/console/clients`, { headers: { [CONSOLE_HEADER]: PASSWORD } }))).status).toBe(401);
    expect((await route(new Request(`${ORIGIN}/api/console/clients`, { headers: { [CONSOLE_HEADER]: "" } }))).status).toBe(401);
  });

  it("sets the identity outcome and writes a chained audit entry for every state change", async () => {
    const { deps, store, lea } = await testDeps();
    const recoveryId = randomUUID();
    expect(await consoleIdentityOutcome(deps, { clientId: "client.lea", outcome: "fail" })).toMatchObject({ outcome: "fail" });
    expect((await consoleClients(deps)).clients.find((c) => c.clientId === "client.lea")?.identityOutcome).toBe("fail");
    expect(await code(consoleIdentityOutcome(deps, { clientId: "client.lea", outcome: "maybe" }))).toBe("400 INVALID_INPUT");
    expect(await code(consoleIdentityOutcome(deps, { clientId: "client.ghost", outcome: "pass" }))).toBe("404 UNKNOWN_CLIENT");
    await consoleIdentityOutcome(deps, { clientId: "client.lea", outcome: "pass" });
    await identityStart(deps, { sqRef: lea.sqRef, recoveryId });
    await identityVerify(deps, good(recoveryId));
    await recoveryCancel(deps, { recoveryId });

    const audit = await store.listAudit();
    expect(audit.map((e) => e.action)).toEqual(["IDENTITY_OUTCOME_SET", "IDENTITY_OUTCOME_SET", "IDENTITY_CHECK_STARTED", "IDENTITY_CHECK_PASSED", "RECOVERY_CANCELLED"]);
    expect(verifyAuditChain(audit)).toBeNull();
    expect(JSON.stringify(audit)).not.toContain(TEST_BANKING_ANSWER);
    expect((await consoleRecoveries(deps)).recoveries[0]).toMatchObject({ recoveryId, outcome: "pass", releaseBlockedBy: "RECOVERY_CANCELLED" });
  });
});
