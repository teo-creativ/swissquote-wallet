import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getAddress, recoverAddress, type Hex } from "viem";
import { safeTxHash, swapOwnerTx, usdcTransferTx } from "@/lib/shared/safe";
import type { Ctx } from "./ctx";
import { ApiError } from "./errors";
import { ACTIONS, handleAction, handleInternal } from "./http";
import * as live from "./live";
import { sessionAccountId } from "./session";
import { USDC, key, testCtx, T0 } from "./testkit";

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof ApiError) return `${e.status} ${e.code}`; throw e; }
  return "no error";
}
const consents = (["terms", "risk", "recovery", "privacy"] as const).map((document) => ({ document, version: "2026-10" }));

/** A signed-in client whose lawyer accepted, with a phone key P1, and a deployed Safe [P1, P2, P3]. */
async function world(over: Record<string, string | undefined> = {}) {
  const t = testCtx(T0, over);
  const { ctx, peers, chain } = t;
  const out = await live.login(ctx, { clientId: "client.lea", password: "demo1234" });
  const id = out.__session;
  await live.kyc(ctx, id);
  await live.register(ctx, id, { consents });
  const inv = await live.invite(ctx, id, { clientDisplayName: "Léa Müller" });
  peers.lawyerAccepted = true;
  const status = await live.lawyerStatus(ctx, id);
  const p1 = key();
  const device = await live.deviceRegister(ctx, id, { label: "This phone", ownerAddress: p1.address, credentialId: "cred-1", prfSupported: true });
  const owners = await live.walletOwners(ctx, id);
  const wallet = await live.walletDeploy(ctx, id);
  chain.usdc.set(wallet.address.toLowerCase(), 20_000_000n);
  const sign = (hash: Hex, who = p1) => who.sign({ hash });
  return { ...t, id, inv, status, p1, device, owners, wallet, sign };
}
type World = Awaited<ReturnType<typeof world>>;

async function prepareAndSign(w: World, to = key().address, amountUsdc = "1.00", who = w.p1) {
  const prep = await live.transferPrepare(w.ctx, w.id, { to, amountUsdc });
  return { prep, p1Signature: await w.sign(prep.safeTxHash as Hex, who) };
}

describe("session and sign-in", () => {
  it("signs in with the Swissquote account, creates the account once and sets a session cookie", async () => {
    const t = testCtx();
    const req = new Request("https://app.test/api/live/login", { method: "POST", body: JSON.stringify({ clientId: "client.lea", password: "demo1234" }), headers: { origin: "https://app.test" } });
    const res = await handleAction(req, "login", () => t.ctx);
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^__Host-sqk_session=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(await res.json()).toEqual({ displayName: "Léa Müller", kycStatus: "not_started", accountStatus: "created" });
    const again = await handleAction(new Request("https://app.test/api/live/login", { method: "POST", body: JSON.stringify({ clientId: "client.lea", password: "demo1234" }), headers: { origin: "https://app.test" } }), "login", () => t.ctx);
    expect(again.status).toBe(200);
    expect(await t.ctx.db.select("accounts")).toHaveLength(1);
  });
  it("refuses a wrong password, a missing session and another origin", async () => {
    const t = testCtx();
    const post = (action: string, body: object, headers: Record<string, string> = { origin: "https://app.test" }) =>
      handleAction(new Request(`https://app.test/api/live/${action}`, { method: "POST", body: JSON.stringify(body), headers }), action, () => t.ctx);
    expect((await post("login", { clientId: "client.lea", password: "bad" })).status).toBe(401);
    const noSession = await post("account", {});
    expect(noSession.status).toBe(401);
    expect((await noSession.json()).error.code).toBe("NOT_AUTHENTICATED");
    expect((await post("account", {}, { origin: "https://evil.test" })).status).toBe(403);
    expect((await post("nope", {})).status).toBe(404);
    const get = await handleAction(new Request("https://app.test/api/live/account"), "account", () => t.ctx);
    expect(get.status).toBe(405);
  });
  it("a session cookie resolves to the account, a tampered one does not", async () => {
    const t = testCtx();
    const out = await live.login(t.ctx, { clientId: "client.lea", password: "demo1234" });
    const res = await handleAction(new Request("https://app.test/api/live/login", { method: "POST", body: JSON.stringify({ clientId: "client.lea", password: "demo1234" }), headers: { origin: "https://app.test" } }), "login", () => t.ctx);
    const cookie = res.headers.get("set-cookie")!.split(";")[0];
    expect(await sessionAccountId(t.ctx, new Request("https://app.test/x", { headers: { cookie } }))).toBe(out.__session);
    expect(await sessionAccountId(t.ctx, new Request("https://app.test/x", { headers: { cookie: cookie.slice(0, -3) + "abc" } }))).toBeNull();
    expect(await sessionAccountId(t.ctx, new Request("http://localhost/x", { headers: { cookie } }))).toBeNull(); // http uses another cookie name
  });
  it("the action table has no handler that skips the session", () => {
    expect(Object.keys(ACTIONS)).not.toContain("login");
    expect(Object.keys(ACTIONS).length).toBeGreaterThan(20);
  });
});

describe("onboarding: lawyer first, then the key", () => {
  it("requires all four consents", async () => {
    const t = testCtx();
    const { __session: id } = await live.login(t.ctx, { clientId: "client.lea", password: "demo1234" });
    expect(await code(live.register(t.ctx, id, { consents: consents.slice(0, 3) }))).toBe("400 CONSENTS_REQUIRED");
    await live.register(t.ctx, id, { consents });
    expect((await live.accountView(t.ctx, id)).consents).toHaveLength(4);
  });
  it("builds the invitation link from NEXT_PUBLIC_LAWYER_URL, registers only its hash, and keeps the link stable", async () => {
    const w = await world();
    expect(w.inv.inviteUrl).toMatch(/^https:\/\/lawyer\.test\/invite\/[A-Za-z0-9_-]{40,}$/);
    const token = w.inv.inviteUrl.split("/invite/")[1];
    const registered = w.peers.ofPath("/api/invite/register");
    expect(registered).toHaveLength(1);
    expect(registered[0].body.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(registered[0].body)).not.toContain(token);
    expect(JSON.stringify(await w.ctx.db.select("invitations"))).not.toContain(token);
    // Asking again before it is accepted gives the same link (the page can reload).
    const t2 = testCtx();
    const { __session: id2 } = await live.login(t2.ctx, { clientId: "client.lea", password: "demo1234" });
    const first = await live.invite(t2.ctx, id2, { clientDisplayName: "Léa" });
    expect((await live.invite(t2.ctx, id2, { clientDisplayName: "Léa" })).inviteUrl).toBe(first.inviteUrl);
    expect(t2.peers.ofPath("/api/invite/register")).toHaveLength(1);
  });
  it("never produces a localhost link in production, and rolls back when the lawyer portal is down", async () => {
    const t = testCtx(T0, { NODE_ENV: "production", NEXT_PUBLIC_LAWYER_URL: undefined });
    const { __session: id } = await live.login(t.ctx, { clientId: "client.lea", password: "demo1234" });
    expect(await code(live.invite(t.ctx, id, { clientDisplayName: "Léa" }))).toBe("503 LAWYER_URL_NOT_CONFIGURED");
    const err = await live.invite(t.ctx, id, { clientDisplayName: "Léa" }).catch((e) => e);
    expect(String(err.message)).toContain("lawyer portal address is not set up");
    expect(String(err.message)).not.toContain("localhost");

    const down = testCtx();
    down.peers.script["lawyer POST /api/invite/register"] = () => { throw new ApiError(502, "PEER_UNAVAILABLE", "Your lawyer's portal did not answer. Nothing was sent. Try again."); };
    const { __session: id2 } = await live.login(down.ctx, { clientId: "client.lea", password: "demo1234" });
    expect(await code(live.invite(down.ctx, id2, { clientDisplayName: "Léa" }))).toBe("502 PEER_UNAVAILABLE");
    expect(await down.ctx.db.select("invitations")).toHaveLength(0);
  });
  it("polls the lawyer until accepted, then the account is ready for the key; the callback does the same", async () => {
    const t = testCtx();
    const { __session: id } = await live.login(t.ctx, { clientId: "client.lea", password: "demo1234" });
    await live.invite(t.ctx, id, { clientDisplayName: "Léa" });
    expect(await live.lawyerStatus(t.ctx, id)).toMatchObject({ status: "invited" });
    expect((await live.accountView(t.ctx, id)).status).toBe("awaiting_lawyer");
    expect(await code(live.deviceRegister(t.ctx, id, { label: "This phone", ownerAddress: key().address, credentialId: "c" }))).toBe("409 LAWYER_NOT_ACCEPTED");
    t.peers.lawyerAccepted = true;
    expect(await live.lawyerStatus(t.ctx, id)).toEqual({ status: "accepted", displayName: "Maître Dupont" });
    expect(await live.accountView(t.ctx, id)).toMatchObject({ status: "ready_for_keys", lawyer: { status: "accepted", displayName: "Maître Dupont" } });

    const t2 = testCtx();
    const { __session: id2 } = await live.login(t2.ctx, { clientId: "client.lea", password: "demo1234" });
    await live.invite(t2.ctx, id2, { clientDisplayName: "Léa" });
    await live.lawyerAccepted(t2.ctx, { sqRef: t2.peers.sqRef, lawyerName: "Maître Dupont" });
    expect((await live.accountView(t2.ctx, id2)).status).toBe("ready_for_keys");
  });
  it("the lawyer callback needs the HMAC", async () => {
    const t = testCtx(T0, { APP_TO_LAWYER_SECRET: "pair-secret-for-tests-only" });
    const res = await handleInternal(new Request("https://app.test/api/internal/lawyer-accepted", { method: "POST", body: "{}" }), live.lawyerAccepted, () => t.ctx);
    expect(res.status).toBe(401);
  });
});

describe("wallet creation: three owners, one Safe, gas paid by the sponsor", () => {
  it("registers the phone key, asks P2 and P3, deploys [P1, P2, P3], registers the wallet with the lawyer", async () => {
    const w = await world();
    expect(w.device).toMatchObject({ label: "This phone", current: true });
    expect(w.owners).toEqual({ p1: getAddress(w.p1.address), p2: w.peers.p2.address, p3: w.peers.p3.address });
    expect(w.peers.deployedOwners).toEqual([getAddress(w.p1.address), w.peers.p2.address, w.peers.p3.address]);
    expect(w.wallet).toMatchObject({ address: w.peers.safeAddress, deployTxHash: `0x${"d".repeat(64)}` });
    expect(w.wallet.explorerUrl).toBe(`https://sepolia.basescan.org/tx/0x${"d".repeat(64)}`);
    expect(w.peers.ofPath("/api/node/wallet/register")[0].body.safeAddress).toBe(w.peers.safeAddress);
    expect(await live.accountView(w.ctx, w.id)).toMatchObject({ status: "active", address: w.peers.safeAddress });
    // Idempotent: asking again changes nothing.
    expect(await live.walletDeploy(w.ctx, w.id)).toMatchObject({ address: w.peers.safeAddress });
    expect(w.peers.ofPath("/api/gas/deploy")).toHaveLength(1);
  });
  it("a second attempt at the phone key replaces the first before the wallet exists", async () => {
    const t = testCtx();
    const { __session: id } = await live.login(t.ctx, { clientId: "client.lea", password: "demo1234" });
    await live.invite(t.ctx, id, { clientDisplayName: "Léa" });
    t.peers.lawyerAccepted = true;
    await live.lawyerStatus(t.ctx, id);
    const [a, b] = [key(), key()];
    await live.deviceRegister(t.ctx, id, { label: "This phone", ownerAddress: a.address, credentialId: "c1" });
    await live.deviceRegister(t.ctx, id, { label: "This phone", ownerAddress: b.address, credentialId: "c2" });
    expect((await live.accountView(t.ctx, id)).devices).toHaveLength(1);
    expect((await live.walletOwners(t.ctx, id)).p1).toBe(getAddress(b.address));
    expect(await code(live.walletDeploy(t.ctx, id).then(() => live.deviceRegister(t.ctx, id, { label: "x", ownerAddress: key().address, credentialId: "c3" })))).toBe("409 WALLET_EXISTS");
  });
  it("reads the real balances through the server", async () => {
    const w = await world();
    expect(await live.balance(w.ctx, w.id)).toEqual({ usdc: "20.00", eth: "0.0000" });
  });
});

describe("sending USDC: P1 signs in the browser, the lawyer node decides, the sponsor executes", () => {
  it("AUTO: confirmed at once with the two signatures of P1 and P2", async () => {
    const w = await world();
    const { prep, p1Signature } = await prepareAndSign(w);
    expect(prep.nonce).toBe("0");
    const hash = safeTxHash({ safe: w.wallet.address, tx: usdcTransferTx(USDC, getAddress(prep.to), 1_000_000n), nonce: 0n });
    expect(prep.safeTxHash).toBe(hash); // the browser can rebuild exactly this hash
    const view = await live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature });
    expect(view).toMatchObject({ status: "confirmed", outcome: "AUTO" });
    expect(view.txHash).toMatch(/^0x/);
    const exec = w.peers.ofPath("/api/gas/exec")[0].body;
    expect(exec.safeTx.value).toBe("0");
    expect(exec.signatures).toHaveLength(2 + 65 * 2 * 2);
    expect(JSON.stringify(await live.activity(w.ctx, w.id))).toContain("Sent USDC");
    // The stored row no longer keeps the signature once it is used.
    expect((await w.ctx.db.select("tx_requests", { id: prep.requestId }))[0].p1_signature).toBeNull();
  });
  it("the lawyer node is asked with the facts, never with a key", async () => {
    const w = await world();
    const { prep, p1Signature } = await prepareAndSign(w, key().address, "2.50");
    await live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature });
    const body = w.peers.ofPath("/api/node/transfer/request")[0].body;
    expect(body).toMatchObject({ sqRef: w.peers.sqRef, safeAddress: w.peers.safeAddress, amount: "2500000", nonce: "0", safeTxHash: prep.safeTxHash });
    expect(JSON.stringify(w.peers.calls)).not.toContain(w.p1.address.toLowerCase() + "-key");
    expect(JSON.stringify(w.peers.calls)).not.toMatch(/privateKey/i);
  });
  it("LAWYER: waits, then runs once when the lawyer approved (two polls at once, one execution)", async () => {
    const w = await world();
    w.peers.transferOutcome = { status: "pending", outcome: "LAWYER", reasons: ["AMOUNT_ABOVE_THRESHOLD"] };
    const { prep, p1Signature } = await prepareAndSign(w, key().address, "8.00");
    const waiting = await live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature });
    expect(waiting).toMatchObject({ status: "pending_lawyer", outcome: "LAWYER", reasons: ["AMOUNT_ABOVE_THRESHOLD"] });
    expect(waiting.approvalExpiresAt).toBeDefined();
    expect(await live.transferStatus(w.ctx, w.id, { requestId: prep.requestId })).toMatchObject({ status: "pending_lawyer" });
    expect(await code(live.transferPrepare(w.ctx, w.id, { to: key().address, amountUsdc: "1.00" }))).toBe("409 TRANSFER_IN_PROGRESS");

    w.peers.lawyerReq = { status: "approved", signature: `0x${"2".repeat(130)}` };
    const [a, b] = await Promise.all([live.transferStatus(w.ctx, w.id, { requestId: prep.requestId }), live.transferStatus(w.ctx, w.id, { requestId: prep.requestId })]);
    expect([a.status, b.status].every((s) => ["confirmed", "signing"].includes(s))).toBe(true);
    expect(w.peers.ofPath("/api/gas/exec")).toHaveLength(1);
    expect((await live.transferStatus(w.ctx, w.id, { requestId: prep.requestId })).status).toBe("confirmed");
  });
  it("LAWYER refuses or does not answer: nothing is sent and the stored signature is dropped", async () => {
    const w = await world();
    w.peers.transferOutcome = { status: "pending", outcome: "LAWYER", reasons: ["NEW_RECIPIENT"] };
    const { prep, p1Signature } = await prepareAndSign(w);
    await live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature });
    w.peers.lawyerReq = { status: "refused", signature: undefined };
    expect(await live.transferStatus(w.ctx, w.id, { requestId: prep.requestId })).toMatchObject({ status: "refused", outcome: "LAWYER" });
    expect(w.peers.ofPath("/api/gas/exec")).toHaveLength(0);
    expect((await w.ctx.db.select("tx_requests", { id: prep.requestId }))[0].p1_signature).toBeNull();

    const e = await world();
    e.peers.transferOutcome = { status: "pending", outcome: "LAWYER", reasons: ["NEW_RECIPIENT"] };
    const x = await prepareAndSign(e);
    await live.transferSubmit(e.ctx, e.id, { requestId: x.prep.requestId, p1Signature: x.p1Signature });
    e.peers.lawyerReq = { status: "expired", signature: undefined };
    expect(await live.transferStatus(e.ctx, e.id, { requestId: x.prep.requestId })).toMatchObject({ status: "expired" });
  });
  it("the client can cancel a waiting transfer", async () => {
    const w = await world();
    w.peers.transferOutcome = { status: "pending", outcome: "LAWYER", reasons: ["NEW_RECIPIENT"] };
    const { prep, p1Signature } = await prepareAndSign(w);
    await live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature });
    await live.transferCancel(w.ctx, w.id, { requestId: prep.requestId });
    w.peers.lawyerReq = { status: "approved", signature: `0x${"2".repeat(130)}` };
    expect(await live.transferStatus(w.ctx, w.id, { requestId: prep.requestId })).toMatchObject({ status: "cancelled" });
    expect(w.peers.ofPath("/api/gas/exec")).toHaveLength(0);
  });
  it("REFUSED by the policy (sanctioned address): no execution", async () => {
    const w = await world();
    w.peers.transferOutcome = { status: "refused", outcome: "REFUSED", reasons: ["SANCTIONED_ADDRESS"] };
    const { prep, p1Signature } = await prepareAndSign(w);
    expect(await live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature })).toMatchObject({ status: "refused", outcome: "REFUSED", reasons: ["SANCTIONED_ADDRESS"] });
    expect(w.peers.ofPath("/api/gas/exec")).toHaveLength(0);
  });
  it("a signature from another key (an old phone) is refused before the lawyer is asked", async () => {
    const w = await world();
    const stranger = key();
    const { prep, p1Signature } = await prepareAndSign(w, key().address, "1.00", stranger);
    expect(await code(live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature }))).toBe("403 WRONG_PHONE");
    expect(w.peers.ofPath("/api/node/transfer/request")).toHaveLength(0);
    expect(await code(live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature: "0x1234" }))).toBe("400 INVALID_INPUT");
  });
  it("a stale nonce fails cleanly, and one account cannot touch another account's transfer", async () => {
    const w = await world();
    const { prep, p1Signature } = await prepareAndSign(w);
    w.chain.safes.get(w.wallet.address.toLowerCase())!.nonce = 5n;
    expect(await code(live.transferSubmit(w.ctx, w.id, { requestId: prep.requestId, p1Signature }))).toBe("409 STALE");
    expect((await live.transferStatus(w.ctx, w.id, { requestId: prep.requestId })).status).toBe("failed");
    const other = await live.login(w.ctx, { clientId: "client.demo", password: "demo1234" });
    w.peers.sqRef = "22222222-2222-4222-8222-222222222222";
    const o = await live.login(w.ctx, { clientId: "client.demo", password: "demo1234" });
    expect(o.__session).not.toBe(w.id);
    void other;
    expect(await code(live.transferStatus(w.ctx, o.__session, { requestId: prep.requestId }))).toBe("404 NOT_FOUND");
  });
  it("transfer/check relays the policy answer", async () => {
    const w = await world();
    w.peers.transferOutcome = { status: "pending", outcome: "LAWYER", reasons: ["NEW_RECIPIENT"] };
    expect(await live.transferCheck(w.ctx, w.id, { to: key().address, amountUsdc: "1.00" })).toEqual({ outcome: "lawyer", reasons: ["NEW_RECIPIENT"] });
    expect(await code(live.transferCheck(w.ctx, w.id, { to: "0x123", amountUsdc: "1.00" }))).toBe("400 INVALID_INPUT");
    expect(await code(live.transferCheck(w.ctx, w.id, { to: key().address, amountUsdc: "1.0000001" }))).toBe("400 INVALID_AMOUNT");
  });
});

describe("Swissquote bank transfer (real USDC from the demo wallet)", () => {
  it("sends to the client's own wallet, shows it as a deposit, and shows the CHF balance", async () => {
    const w = await world();
    const res = await live.swissquoteTransfer(w.ctx, w.id, { amountUsdc: "5.00" });
    expect(res.txHash).toBe(`0x${"b".repeat(64)}`);
    expect(w.peers.ofPath("/api/bank/transfer")[0].body).toEqual({ sqRef: w.peers.sqRef, to: w.peers.safeAddress, amountUsdc: "5000000" });
    expect((await live.activity(w.ctx, w.id)).find((a) => a.kind === "transfer_in")).toMatchObject({ amountUsdc: "5.00", counterparty: "Swissquote" });
    expect(await live.swissquoteAccount(w.ctx, w.id)).toEqual({ cashChf: "18165.00" });
  });
});

describe("recovery on a new phone: same address, old phone loses control", () => {
  async function recovering() {
    const w = await world();
    const { recoveryId } = await live.recoveryStart(w.ctx, w.id);
    const p1New = key();
    return { ...w, recoveryId, p1New };
  }
  it("start, identity, new key, lawyer approval, delay, swapOwner", async () => {
    const r = await recovering();
    expect((await live.accountView(r.ctx, r.id)).status).toBe("recovering");
    expect(await live.recoveryStart(r.ctx, r.id)).toEqual({ recoveryId: r.recoveryId });
    expect((await live.alerts(r.ctx, r.id))[0].kind).toBe("recovery_requested");
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "identity_pending", identityVerified: false });
    expect(await code(live.recoveryAttach(r.ctx, r.id, { recoveryId: r.recoveryId, ownerAddress: r.p1New.address, credentialId: "cred-2" }))).toBe("409 IDENTITY_NOT_VERIFIED");

    expect(await live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "right" })).toEqual({ verified: true });
    const attached = await live.recoveryAttach(r.ctx, r.id, { recoveryId: r.recoveryId, ownerAddress: r.p1New.address, credentialId: "cred-2" });
    expect(attached.newAddress).toBe(r.peers.safeAddress); // the wallet address does not change
    expect(r.peers.ofPath("/api/node/recovery/request")[0].body).toMatchObject({ safeAddress: r.peers.safeAddress, newOwnerAddress: getAddress(r.p1New.address) });
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "waiting", lawyerStatus: "pending", identityVerified: true });
    expect(await code(live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId }))).toBe("409 RECOVERY_NOT_READY");

    // Lawyer approved, delay elapsed.
    const state = await r.chain.getSafeState(r.wallet.address);
    const tx = swapOwnerTx({ safe: r.wallet.address, owners: state.owners, oldOwner: state.owners[0], newOwner: r.p1New.address });
    const hash = safeTxHash({ safe: r.wallet.address, tx, nonce: state.nonce });
    r.peers.lawyerRecovery = { status: "approved", signature: `0x${"2".repeat(130)}`, safeTxHash: hash };
    r.peers.recovery.delayElapsed = true;
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "ready", lawyerStatus: "approved" });
    const done = await live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId });
    expect(done.txHash).toMatch(/^0x/);
    const sign = r.peers.ofPath("/api/node/sign")[0].body;
    expect(sign).toMatchObject({ recoveryId: r.recoveryId, safeTxHash: hash });
    expect(r.peers.ofPath("/api/recovery/executed")).toHaveLength(1);

    const account = await live.accountView(r.ctx, r.id);
    expect(account).toMatchObject({ status: "active", address: r.peers.safeAddress, recovery: null });
    expect(account.devices).toHaveLength(1);
    expect((await r.ctx.db.select("devices", { account_id: r.id, revoked_at: null }))[0].owner_address).toBe(r.p1New.address.toLowerCase());
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "completed" });

    // The old phone is refused, the new one works.
    const old = await prepareAndSign(r, key().address, "1.00", r.p1);
    expect(await code(live.transferSubmit(r.ctx, r.id, { requestId: old.prep.requestId, p1Signature: old.p1Signature }))).toBe("403 WRONG_PHONE");
    const fresh = await prepareAndSign(r, key().address, "1.00", r.p1New);
    expect(await live.transferSubmit(r.ctx, r.id, { requestId: fresh.prep.requestId, p1Signature: fresh.p1Signature })).toMatchObject({ status: "confirmed" });
  });
  it("attacker: the identity check fails, the recovery ends refused and the old phone keeps control", async () => {
    const r = await recovering();
    expect(await live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "wrong" })).toEqual({ verified: false });
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "identity_failed", identityVerified: false });
    expect(await code(live.recoveryAttach(r.ctx, r.id, { recoveryId: r.recoveryId, ownerAddress: r.p1New.address, credentialId: "x" }))).toBe("409 IDENTITY_NOT_VERIFIED");
    expect(await code(live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId }))).toBe("409 RECOVERY_NOT_READY");
    expect((await r.chain.getSafeState(r.wallet.address)).owners[0]).toBe(getAddress(r.p1.address));
    const { prep, p1Signature } = await prepareAndSign(r);
    expect(await live.transferSubmit(r.ctx, r.id, { requestId: prep.requestId, p1Signature })).toMatchObject({ status: "confirmed" });
    expect((await live.accountView(r.ctx, r.id)).status).toBe("active");
  });
  it("the lawyer refuses: refused, nothing executes, the account is active again", async () => {
    const r = await recovering();
    await live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "right" });
    await live.recoveryAttach(r.ctx, r.id, { recoveryId: r.recoveryId, ownerAddress: r.p1New.address, credentialId: "cred-2" });
    r.peers.lawyerRecovery = { status: "refused", signature: undefined, safeTxHash: undefined };
    r.peers.recovery.delayElapsed = true;
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "refused", lawyerStatus: "refused" });
    expect(await code(live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId }))).toBe("409 RECOVERY_NOT_READY");
    expect((await live.accountView(r.ctx, r.id)).status).toBe("active");
    expect(r.peers.ofPath("/api/node/sign")).toHaveLength(0);
  });
  it("the client can cancel during the delay", async () => {
    const r = await recovering();
    await live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "right" });
    await live.recoveryCancel(r.ctx, r.id, { recoveryId: r.recoveryId });
    expect(await live.recoveryView(r.ctx, r.id, { recoveryId: r.recoveryId })).toMatchObject({ status: "cancelled", cancelledBy: "client" });
    expect(await code(live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "right" }))).toBe("409 RECOVERY_CLOSED");
    expect((await live.accountView(r.ctx, r.id)).status).toBe("active");
  });
  it("two clicks on execute run the swap once", async () => {
    const r = await recovering();
    await live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "right" });
    await live.recoveryAttach(r.ctx, r.id, { recoveryId: r.recoveryId, ownerAddress: r.p1New.address, credentialId: "cred-2" });
    const state = await r.chain.getSafeState(r.wallet.address);
    const hash = safeTxHash({ safe: r.wallet.address, tx: swapOwnerTx({ safe: r.wallet.address, owners: state.owners, oldOwner: state.owners[0], newOwner: r.p1New.address }), nonce: state.nonce });
    r.peers.lawyerRecovery = { status: "approved", signature: `0x${"2".repeat(130)}`, safeTxHash: hash };
    r.peers.recovery.delayElapsed = true;
    const results = await Promise.allSettled([live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId }), live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId })]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.peers.ofPath("/api/gas/exec").filter((c) => c.body.safeTx.data.startsWith("0xe318b52b"))).toHaveLength(1);
  });
  it("refuses a lawyer hash that is not the swap this server rebuilt", async () => {
    const r = await recovering();
    await live.recoveryVerify(r.ctx, r.id, { recoveryId: r.recoveryId, bankingAnswer: "right" });
    await live.recoveryAttach(r.ctx, r.id, { recoveryId: r.recoveryId, ownerAddress: r.p1New.address, credentialId: "cred-2" });
    r.peers.lawyerRecovery = { status: "approved", signature: `0x${"2".repeat(130)}`, safeTxHash: `0x${"9".repeat(64)}` };
    r.peers.recovery.delayElapsed = true;
    expect(await code(live.recoveryExecute(r.ctx, r.id, { recoveryId: r.recoveryId }))).toBe("409 HASH_MISMATCH");
    expect(r.peers.ofPath("/api/node/sign")).toHaveLength(0);
    // The recovery is still open after the failure.
    expect((await r.ctx.db.select("recoveries", { id: r.recoveryId }))[0].status).toBe("awaiting_approval_and_delay");
  });
});

describe("exit kit", () => {
  it("gives the public facts the kit needs and records its creation", async () => {
    const w = await world();
    expect(await live.exitKitInfo(w.ctx, w.id)).toMatchObject({ safeAddress: w.peers.safeAddress, p2Address: w.peers.p2.address, p3Address: w.peers.p3.address, chainId: 84532 });
    await live.exitKitRecord(w.ctx, w.id);
    expect((await live.accountView(w.ctx, w.id)).exitKitCreatedAt).toBe(T0.toISOString());
  });
});

void randomUUID;
void recoverAddress;
void ({} as Ctx);
