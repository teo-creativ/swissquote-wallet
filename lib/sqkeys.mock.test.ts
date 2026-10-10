import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "./sqkeys";
import { acceptMockLawyerInvite, resetMockState, resolveMockTx, seedActiveWallet, setMockPanel, skipDelay } from "./sqkeys.mock";
import type { TxView } from "./sqkeys";
import { LEGAL_DOCUMENT_VERSION } from "./legalVersion";

// The mock sleeps 300-1500 ms per call: run it on fake timers.
const settle = <T>(p: Promise<T>): Promise<T> => vi.runAllTimersAsync().then(() => p);
const RECIPIENT_KNOWN = "0x5aa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3";
const RECIPIENT_NEW = "0x1111111111111111111111111111111111112222";
const RECIPIENT_SANCTIONED = "0x2222222222222222222222222222222222220000";

beforeEach(() => {
  vi.useFakeTimers();
  setMockPanel({ autoLawyer: true, identityPass: true });
  resetMockState();
});
afterEach(() => vi.useRealTimers());

describe("mock login", () => {
  it("accepts client.lea / demo1234", async () => {
    const r = await settle(api.loginSwissquote("client.lea", "demo1234"));
    expect(r.displayName).toBeTruthy();
    expect(r.accountStatus).toBe("created");
  });

  it("rejects any other credentials with INVALID_CREDENTIALS", async () => {
    const p = api.loginSwissquote("client.lea", "wrong").catch((e) => e);
    const err = await settle(p);
    expect(err).toBeInstanceOf(api.SqKeysError);
    expect(err.code).toBe("INVALID_CREDENTIALS");
  });

  it("refuses wallet calls when signed out", async () => {
    const err = await settle(api.getBalance().catch((e) => e));
    expect(err.code).toBe("NOT_AUTHENTICATED");
  });
});

describe("mock onboarding", () => {
  it("goes from login to an active wallet", async () => {
    await settle(api.loginSwissquote("client.lea", "demo1234"));
    await settle(api.runKyc(() => undefined));
    await settle(api.registerAccount(["terms", "risk", "recovery", "privacy"].map((document) => ({ document: document as "terms", version: LEGAL_DOCUMENT_VERSION }))));
    const device = await settle(api.createDevicePasskey("My phone"));
    expect(device.current).toBe(true);
    const invite = await settle(api.inviteLawyer("Léa"));
    expect(invite.inviteUrl).toContain("/invite/");
    expect((await settle(api.getLawyerStatus())).status).toBe("invited");
    await vi.advanceTimersByTimeAsync(8_000); // auto lawyer is on: accepts after 8 s
    expect((await settle(api.getLawyerStatus())).status).toBe("accepted");
    const steps: string[] = [];
    const { address } = await settle(api.createWallet((s) => steps.push(s)));
    expect(address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(steps).toEqual(["preparing", "creating_keys", "checking_keys", "saving_key_on_device", "linking_wallet", "funding_gas", "done"]);
    expect((await settle(api.getAccount())).status).toBe("active");
  });

  it("waits for the lawyer when auto lawyer is off", async () => {
    setMockPanel({ autoLawyer: false });
    await settle(api.loginSwissquote("client.lea", "demo1234"));
    await settle(api.inviteLawyer("Léa"));
    expect((await settle(api.getLawyerStatus())).status).toBe("invited");
    acceptMockLawyerInvite();
    expect((await settle(api.getLawyerStatus())).status).toBe("accepted");
  });

  it("fails with PRF_NOT_SUPPORTED when the phone has no passkey support", async () => {
    setMockPanel({ prfSupported: false });
    await settle(api.loginSwissquote("client.lea", "demo1234"));
    const err = await settle(api.createDevicePasskey("My phone").catch((e) => e));
    expect(err.code).toBe("PRF_NOT_SUPPORTED");
    setMockPanel({ prfSupported: true });
  });

  it("requires all four consents", async () => {
    await settle(api.loginSwissquote("client.lea", "demo1234"));
    const err = await settle(api.registerAccount([{ document: "terms", version: LEGAL_DOCUMENT_VERSION }]).catch((e) => e));
    expect(err.code).toBe("CONSENTS_REQUIRED");
  });
});

describe("mock transfers", () => {
  beforeEach(() => seedActiveWallet());

  it("sends 1 USDC to a known recipient instantly", async () => {
    const updates: TxView["status"][] = [];
    const tx = await settle(api.sendUsdc({ to: RECIPIENT_KNOWN, amountUsdc: "1.00" }, (t) => updates.push(t.status)));
    expect(tx.status).toBe("confirmed");
    expect(tx.outcome).toBe("AUTO");
    expect(tx.explorerUrl).toContain(tx.txHash);
    expect(updates).toEqual(["evaluating", "approved", "signing", "broadcast", "confirmed"]);
    expect((await settle(api.getBalance())).usdc).toBe("24.00");
  });

  it("previews without reserving anything", async () => {
    expect(await settle(api.checkTransfer({ to: RECIPIENT_NEW, amountUsdc: "1.00" }))).toEqual({ outcome: "lawyer", reasons: ["NEW_RECIPIENT"] });
    expect(await settle(api.checkTransfer({ to: RECIPIENT_KNOWN, amountUsdc: "6.00" }))).toEqual({ outcome: "lawyer", reasons: ["AMOUNT_ABOVE_THRESHOLD"] });
    expect(await settle(api.checkTransfer({ to: RECIPIENT_SANCTIONED, amountUsdc: "1.00" }))).toEqual({ outcome: "refused", reasons: ["SANCTIONED_ADDRESS"] });
    expect(await settle(api.checkTransfer({ to: RECIPIENT_KNOWN, amountUsdc: "1.00" }))).toEqual({ outcome: "instant", reasons: ["WITHIN_POLICY"] });
  });

  it("refuses a sanctioned recipient", async () => {
    const tx = await settle(api.sendUsdc({ to: RECIPIENT_SANCTIONED, amountUsdc: "1.00" }, () => undefined));
    expect(tx.status).toBe("refused");
    expect(tx.outcome).toBe("REFUSED");
    expect((await settle(api.getBalance())).usdc).toBe("25.00");
  });

  it("auto-approves a lawyer request after 8 s and remembers the recipient", async () => {
    const tx = await settle(api.sendUsdc({ to: RECIPIENT_NEW, amountUsdc: "1.00" }, () => undefined));
    expect(tx.status).toBe("confirmed");
    expect(tx.outcome).toBe("LAWYER");
    expect((await settle(api.getAccount())).policy?.approvedRecipients).toContain(RECIPIENT_NEW);
  });

  it("resolves refused from the panel when auto lawyer is off", async () => {
    setMockPanel({ autoLawyer: false });
    const seen: TxView[] = [];
    const p = api.sendUsdc({ to: RECIPIENT_NEW, amountUsdc: "1.00" }, (t) => seen.push(t));
    await vi.advanceTimersByTimeAsync(30_000);
    const pending = seen.at(-1) as TxView;
    expect(pending.status).toBe("pending_lawyer");
    expect(pending.approvalExpiresAt).toBeTruthy();
    resolveMockTx(pending.requestId, "refused");
    const tx = await settle(p);
    expect(tx.status).toBe("refused");
    expect((await settle(api.getBalance())).usdc).toBe("25.00");
  });

  it("cancels a pending request", async () => {
    setMockPanel({ autoLawyer: false });
    const seen: TxView[] = [];
    const p = api.sendUsdc({ to: RECIPIENT_NEW, amountUsdc: "1.00" }, (t) => seen.push(t));
    await vi.advanceTimersByTimeAsync(5_000);
    const id = (seen.at(-1) as TxView).requestId;
    await settle(api.cancelTx(id));
    expect((await settle(p)).status).toBe("cancelled");
    expect((await settle(api.getTx(id))).status).toBe("cancelled");
  });

  it("rejects amounts above the balance", async () => {
    const err = await settle(api.sendUsdc({ to: RECIPIENT_KNOWN, amountUsdc: "99.00" }, () => undefined).catch((e) => e));
    expect(err.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("deposits from Swissquote within the demo limits", async () => {
    const before = await settle(api.getSwissquoteAccount());
    const r = await settle(api.transferFromSwissquote("5.00"));
    expect(r.explorerUrl).toContain(r.txHash);
    expect((await settle(api.getBalance())).usdc).toBe("30.00");
    expect(Number((await settle(api.getSwissquoteAccount())).cashChf)).toBeLessThan(Number(before.cashChf));
    const err = await settle(api.transferFromSwissquote("11.00").catch((e) => e));
    expect(err.code).toBe("LIMIT_EXCEEDED");
  });

  it("describes an app approval in plain text (annex F.4)", async () => {
    const known = await settle(api.simulateApp({ spender: "0x00000000000000000000000000000000000d0001", amountUsdc: "3.00" }));
    expect(known).toMatchObject({ appName: "Demo Swap", known: true, unlimited: false, plainText: "This lets Demo Swap spend up to 3.00 USDC from your wallet." });
    const unknown = await settle(api.simulateApp({ spender: RECIPIENT_NEW, amountUsdc: "unlimited" }));
    expect(unknown.known).toBe(false);
    expect(unknown.plainText).toContain("spend any amount, at any time, until you cancel it.");
    expect(unknown.plainText).toContain("We don't know this app. You decide, at your own risk.");
  });

  it("asks the lawyer for an unlimited approval", async () => {
    const tx = await settle(api.approveApp({ spender: "0x00000000000000000000000000000000000d0001", amountUsdc: "unlimited" }, () => undefined));
    expect(tx.outcome).toBe("LAWYER");
    expect(tx.reasons).toEqual(["UNLIMITED_APPROVAL"]);
  });

  it("lists activity, alerts and an exit kit", async () => {
    await settle(api.sendUsdc({ to: RECIPIENT_KNOWN, amountUsdc: "1.00" }, () => undefined));
    const activity = await settle(api.getActivity());
    expect(activity.some((a) => a.kind === "transfer_out" && a.amountUsdc === "1.00")).toBe(true);
    expect(Array.isArray(await settle(api.getAlerts()))).toBe(true);
    const kit = await settle(api.createExitKit("a long enough passphrase"));
    expect(kit.size).toBeGreaterThan(0);
    expect((await settle(api.getAccount())).exitKitCreatedAt).toBeTruthy();
  });
});

describe("mock recovery", () => {
  beforeEach(() => seedActiveWallet());

  it("completes after the 120 s delay and moves to a new address", async () => {
    const oldAddress = (await settle(api.getAccount())).address;
    const { recoveryId } = await settle(api.startRecovery());
    expect((await settle(api.getAccount())).status).toBe("recovering");
    expect(await settle(api.verifyIdentity(recoveryId, { bankingAnswer: "Geneva" }))).toEqual({ verified: true });
    const { newAddress } = await settle(api.createRecoveryWallet(recoveryId, () => undefined));
    expect(newAddress).not.toBe(oldAddress);

    const view = await settle(api.getRecovery(recoveryId));
    expect(view.status).toBe("waiting");
    expect(Date.parse(view.releaseAfter as string) - Date.now()).toBeGreaterThan(60_000);
    const early = await settle(api.executeRecovery(recoveryId).catch((e) => e));
    expect(early.code).toBe("RECOVERY_NOT_READY");

    skipDelay();
    expect((await settle(api.getRecovery(recoveryId))).status).toBe("ready");
    const done = await settle(api.executeRecovery(recoveryId));
    expect(done.explorerUrl).toContain(done.txHash);
    expect((await settle(api.getAccount())).address).toBe(newAddress);
  });

  it("fails when the identity check fails", async () => {
    setMockPanel({ identityPass: false });
    const { recoveryId } = await settle(api.startRecovery());
    expect(await settle(api.verifyIdentity(recoveryId, { bankingAnswer: "Geneva" }))).toEqual({ verified: false });
    const err = await settle(api.createRecoveryWallet(recoveryId, () => undefined).catch((e) => e));
    expect(err.code).toBe("IDENTITY_NOT_VERIFIED");
    expect((await settle(api.getRecovery(recoveryId))).status).toBe("identity_failed");
  });

  it("can be cancelled during the delay", async () => {
    const { recoveryId } = await settle(api.startRecovery());
    await settle(api.verifyIdentity(recoveryId, { bankingAnswer: "Geneva" }));
    await settle(api.cancelRecovery(recoveryId));
    const view = await settle(api.getRecovery(recoveryId));
    expect(view).toMatchObject({ status: "cancelled", cancelledBy: "client" });
    expect((await settle(api.getAccount())).status).toBe("active");
  });

  it("pauses transfers while a verified recovery is running", async () => {
    const { recoveryId } = await settle(api.startRecovery());
    await settle(api.verifyIdentity(recoveryId, { bankingAnswer: "Geneva" }));
    const err = await settle(api.sendUsdc({ to: RECIPIENT_KNOWN, amountUsdc: "1.00" }, () => undefined).catch((e) => e));
    expect(err.code).toBe("RECOVERY_IN_PROGRESS");
  });
});

describe("consent record", () => {
  it("stores the acceptance time (ISO 8601, UTC) and version for each document", async () => {
    vi.setSystemTime(new Date("2026-03-04T10:20:30.000Z"));
    await settle(api.loginSwissquote("client.lea", "demo1234"));
    await settle(api.registerAccount(["terms", "risk", "recovery", "privacy"].map((document) => ({ document: document as "terms", version: LEGAL_DOCUMENT_VERSION }))));
    const consents = (await settle(api.getAccount())).consents ?? [];
    expect(consents).toHaveLength(4);
    for (const c of consents) {
      expect(c.version).toBe(LEGAL_DOCUMENT_VERSION);
      expect(c.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(Date.parse(c.acceptedAt)).toBeGreaterThanOrEqual(Date.parse("2026-03-04T10:20:30.000Z"));
    }
  });
});

describe("legal document version", () => {
  it("is defined once: the documents screen imports it and has no literal of its own", () => {
    const page = readFileSync(join(process.cwd(), "app/(mobile)/documents/page.tsx"), "utf8");
    expect(page).toContain("LEGAL_DOCUMENT_VERSION");
    expect(page).not.toMatch(/version:\s*["']/);
    expect(page).not.toMatch(/\bVERSION\s*=/);
    expect(LEGAL_DOCUMENT_VERSION).toBe("1.0");
  });

  it("is what the seeded mock account carries", async () => {
    seedActiveWallet();
    const consents = (await settle(api.getAccount())).consents ?? [];
    expect(consents.every((c) => c.version === LEGAL_DOCUMENT_VERSION)).toBe(true);
  });
});
