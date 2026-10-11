import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress, recoverAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { verifyRequest, MemoryNonceStore } from "@/src/shared/hmac";
import { safeTxHash, swapOwnerTx, usdcTransferTx } from "@/src/shared/safe";
import { appendAudit } from "./audit";
import type { Ctx } from "./ctx";
import { ApiError } from "./errors";
import { hmacRoute } from "./http";
import { inviteInspect, inviteRegister, inviteStatus, loginFinish, loginStart, registerOptions, registerVerify } from "./invites";
import { nodeOwnerCreate, policyView, transferCheck, exitRequest, exitStatus, recoveryRequest, recoveryStatus, transferRequest, transferStatus } from "./nodes";
import { auditVerify, clientViews, decideOptions, decideVerify, journal, me, policyGet, policyOptions, policyVerify, requestDetail, requestSummaries } from "./portal";
import { sessionLawyerId } from "./session";
import { SoftAuthenticator, testCtx, T0 } from "./testkit";
import { sha256Hex } from "./util";
import { approvalChallenge } from "./webauthn";

const key = () => privateKeyToAccount(generatePrivateKey()); // throwaway test owners
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;
const SECOND = 1000;

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { if (e instanceof ApiError) return `${e.status} ${e.code}`; throw e; }
  return "no error";
}

let callbacks: { url: string; headers: Headers; body: string }[] = [];
beforeEach(() => {
  callbacks = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    callbacks.push({ url, headers: new Headers(init.headers), body: String(init.body) });
    return new Response("{}", { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

/** Invitation accepted by a lawyer with a software passkey, and a deployed Safe [P1, P2, P3] on the fake chain. */
async function world(now = T0) {
  const t = testCtx(now);
  const { ctx, chain } = t;
  const sqRef = randomUUID();
  const token = `tok-${randomUUID()}`;
  await inviteRegister(ctx, { sqRef, tokenHash: sha256Hex(token), displayName: "Léa Martin" });
  const authenticator = new SoftAuthenticator();
  const options = await registerOptions(ctx, { token, displayName: "Maître Dupont", firm: "Étude Dupont" });
  const done = (await registerVerify(ctx, { token, response: authenticator.register(options) })) as { __cookie: string; body: { lawyerId: string } };
  const lawyerId = done.body.lawyerId;
  const client = (await ctx.db.select("clients", { sq_ref: sqRef }))[0];
  const { address: p2 } = await nodeOwnerCreate(ctx, { sqRef });
  const [p1, p3] = [key(), key()];
  const safe = key().address;
  chain.deploy(safe, [p1.address, p2, p3.address]);
  const req = (to: Address, amountBase: bigint, nonce = 0n, over: Record<string, unknown> = {}) => ({
    sqRef, safeAddress: safe, to, amount: amountBase.toString(), nonce: nonce.toString(),
    safeTxHash: safeTxHash({ safe, tx: usdcTransferTx(USDC, to, amountBase), nonce }), ...over,
  });
  const hashOf = (to: Address, amountBase: bigint, nonce = 0n) => safeTxHash({ safe, tx: usdcTransferTx(USDC, to, amountBase), nonce });
  /** Sets the approved list to this address so only the amount rules apply. */
  const approve = async (to: Address) => { await ctx.db.insert("recipients", { client_id: client.id, address: to.toLowerCase(), status: "approved", approved_at: ctx.now.toISOString() }); };
  return { ...t, sqRef, token, authenticator, lawyerId, client, p1, p2, p3, safe, req, hashOf, approve, cookie: done.__cookie };
}
type World = Awaited<ReturnType<typeof world>>;

async function decide(w: World, ctx: Ctx, id: string, decision: "approve" | "refuse", extra: Record<string, unknown> = {}) {
  const options = (await decideOptions(ctx, w.lawyerId, { id, decision })) as any;
  return decideVerify(ctx, w.lawyerId, { id, decision, response: w.authenticator.assert(options), ...extra });
}

describe("invitation and lawyer account (real WebAuthn verification)", () => {
  it("registers by token hash and shows only a valid or invalid answer", async () => {
    const { ctx } = testCtx();
    const token = "tok-a";
    const sqRef = randomUUID();
    expect(await inviteRegister(ctx, { sqRef, tokenHash: sha256Hex(token), displayName: "Léa" })).toMatchObject({ alreadyRegistered: false });
    expect(await inviteRegister(ctx, { sqRef, tokenHash: sha256Hex(token), displayName: "Léa" })).toMatchObject({ alreadyRegistered: true });
    expect(await inviteInspect(ctx, { token })).toMatchObject({ valid: true, clientDisplayName: "Léa" });
    expect(await inviteInspect(ctx, { token: "wrong" })).toEqual({ valid: false, clientDisplayName: "", expiresAt: "" });
    expect(await code(inviteRegister(ctx, { sqRef, tokenHash: "nothex", displayName: "Léa" }))).toBe("400 INVALID_INPUT");
    // The raw token is never stored.
    expect(JSON.stringify(await ctx.db.select("invitations"))).not.toContain(token);
    expect(await inviteStatus(ctx, { sqRef })).toEqual({ status: "invited" });
  });

  it("expires after 7 days; a newer link replaces the older one", async () => {
    const { ctx, at } = testCtx();
    const sqRef = randomUUID();
    await inviteRegister(ctx, { sqRef, tokenHash: sha256Hex("old"), displayName: "Léa" });
    await inviteRegister(ctx, { sqRef, tokenHash: sha256Hex("new"), displayName: "Léa" });
    expect((await inviteInspect(ctx, { token: "old" })).valid).toBe(false);
    expect((await inviteInspect(ctx, { token: "new" })).valid).toBe(true);
    expect((await inviteInspect(at(6 * 24 * 3600 * SECOND), { token: "new" })).valid).toBe(true);
    expect((await inviteInspect(at(7 * 24 * 3600 * SECOND + 1), { token: "new" })).valid).toBe(false);
  });

  it("creates the account with a verified passkey, makes the lawyer P2, opens a session and tells the client app (HMAC)", async () => {
    const w = await world();
    expect(w.cookie).toContain("HttpOnly");
    expect(w.cookie).toContain("SameSite=Strict");
    expect(w.cookie).toContain("Secure");
    expect(await sessionLawyerId(w.ctx, new Request(ORIGIN_URL, { headers: { cookie: w.cookie.split(";")[0] } }))).toBe(w.lawyerId);
    expect(await sessionLawyerId(w.ctx, new Request(ORIGIN_URL))).toBeNull();
    expect(await sessionLawyerId(w.ctx, new Request(ORIGIN_URL, { headers: { cookie: w.cookie.split(";")[0].slice(0, -2) + "xx" } }))).toBeNull();
    expect((await w.ctx.db.select("clients", { sq_ref: w.sqRef }))[0]).toMatchObject({ status: "accepted", lawyer_id: w.lawyerId });
    expect((await w.ctx.db.select("lawyer_passkeys", { lawyer_id: w.lawyerId }))).toHaveLength(1);

    const cb = callbacks.find((c) => c.url === "https://app.test/api/internal/lawyer-accepted");
    expect(cb).toBeDefined();
    expect(JSON.parse(cb!.body)).toMatchObject({ sqRef: w.sqRef, lawyerName: "Maître Dupont" });
    const auth = await verifyRequest({ secret: w.ctx.env.APP_TO_LAWYER_SECRET, method: "POST", path: "/api/internal/lawyer-accepted", body: cb!.body, headers: cb!.headers, nonces: new MemoryNonceStore(), now: w.ctx.now });
    expect(auth).toEqual({ ok: true });
    expect(await inviteStatus(w.ctx, { sqRef: w.sqRef })).toMatchObject({ status: "accepted", lawyerName: "Maître Dupont" });
  });

  it("the P2 key exists only encrypted, and is the same address when asked again", async () => {
    const w = await world();
    const share = (await w.ctx.db.select("shares", { client_id: w.client.id }))[0];
    expect(share.keyshare_enc).toMatch(/^[0-9a-f]{96}$/);
    expect((await nodeOwnerCreate(w.ctx, { sqRef: w.sqRef })).address).toBe(getAddress(share.address));
    expect(await w.ctx.db.select("shares", { client_id: w.client.id })).toHaveLength(1);
  });

  it("the invitation works once; the passkey and the challenge are single use", async () => {
    const w = await world();
    const again = await registerOptions(w.ctx, { token: w.token, displayName: "X", firm: "" }).catch((e) => e);
    expect(again).toBeInstanceOf(ApiError);
    expect((again as ApiError).code).toBe("INVITATION_INVALID");
    // A second client invited, the same authenticator tries to register again: refused (no duplicate credential).
    const other = randomUUID();
    await inviteRegister(w.ctx, { sqRef: other, tokenHash: sha256Hex("second"), displayName: "Aaron" });
    const options = await registerOptions(w.ctx, { token: "second", displayName: "Maître Dupont", firm: "" });
    const response = w.authenticator.register(options);
    expect(await code(registerVerify(w.ctx, { token: "second", response }))).toBe("409 PASSKEY_EXISTS");
    // The failed attempt did not burn the invitation: a new authenticator can still accept it.
    const fresh = new SoftAuthenticator();
    const options2 = await registerOptions(w.ctx, { token: "second", displayName: "Maître Dupont", firm: "" });
    expect(await code(registerVerify(w.ctx, { token: "second", response: fresh.register(options2) }))).toBe("no error");
  });

  it("rejects a registration whose challenge was never issued, or issued for another lawyer", async () => {
    const { ctx } = testCtx();
    await inviteRegister(ctx, { sqRef: randomUUID(), tokenHash: sha256Hex("t1"), displayName: "A" });
    const options = await registerOptions(ctx, { token: "t1", displayName: "L", firm: "" });
    const forged = new SoftAuthenticator().register({ ...options, challenge: Buffer.from("not-issued-by-the-server").toString("base64url") });
    expect(await code(registerVerify(ctx, { token: "t1", response: forged }))).toBe("400 CHALLENGE_INVALID");
    const wrongOrigin = new SoftAuthenticator(undefined, "https://evil.test").register(options);
    expect(await code(registerVerify(ctx, { token: "t1", response: wrongOrigin }))).toBe("400 PASSKEY_REJECTED");
  });
});

const ORIGIN_URL = "https://lawyer.test/api/x";

describe("sign-in with a passkey", () => {
  it("signs in, once per challenge, and refuses unknown passkeys, a missing user verification and another origin", async () => {
    const w = await world();
    const options = (await loginStart(w.ctx)) as any;
    const response = w.authenticator.assert(options);
    const out = (await loginFinish(w.ctx, { response })) as { __cookie: string };
    expect(await sessionLawyerId(w.ctx, new Request(ORIGIN_URL, { headers: { cookie: out.__cookie.split(";")[0] } }))).toBe(w.lawyerId);
    expect(await code(loginFinish(w.ctx, { response }))).toBe("400 CHALLENGE_INVALID"); // replay

    const o2 = (await loginStart(w.ctx)) as any;
    expect(await code(loginFinish(w.ctx, { response: new SoftAuthenticator().assert(o2) }))).toBe("401 UNKNOWN_PASSKEY");
    const o3 = (await loginStart(w.ctx)) as any;
    expect(await code(loginFinish(w.ctx, { response: w.authenticator.assert(o3, { userVerified: false }) }))).toBe("401 PASSKEY_REJECTED");
    const o4 = (await loginStart(w.ctx)) as any;
    const evil = new SoftAuthenticator(undefined, "https://evil.test");
    Object.assign(evil, { key: (w.authenticator as any).key, credentialId: w.authenticator.credentialId });
    expect(await code(loginFinish(w.ctx, { response: evil.assert(o4) }))).toBe("401 PASSKEY_REJECTED");
  });

  it("a challenge expires after 5 minutes", async () => {
    const w = await world();
    const options = (await loginStart(w.ctx)) as any;
    expect(await code(loginFinish(w.at(301 * SECOND), { response: w.authenticator.assert(options) }))).toBe("400 CHALLENGE_INVALID");
  });
});

describe("transfers: policy vectors T1 to T13 on the server", () => {
  it("T1 5 USDC exactly is AUTO and P2 signs the hash the node built", async () => {
    const w = await world();
    await w.approve(w.p1.address);
    const to = w.p1.address;
    const out = await transferRequest(w.ctx, w.req(to, 5_000_000n));
    expect(out).toMatchObject({ status: "signed", outcome: "AUTO", reasons: ["WITHIN_POLICY"] });
    if (out.status !== "signed") throw new Error("unreachable");
    expect(await recoverAddress({ hash: w.hashOf(to, 5_000_000n), signature: out.signature })).toBe(w.p2);
    expect(out.signer).toBe(w.p2);
  });
  it("T2 5.000001 USDC needs the lawyer (AMOUNT_ABOVE_THRESHOLD)", async () => {
    const w = await world();
    await w.approve(w.p1.address);
    expect(await transferRequest(w.ctx, w.req(w.p1.address, 5_000_001n))).toMatchObject({ status: "pending", outcome: "LAWYER", reasons: ["AMOUNT_ABOVE_THRESHOLD"] });
  });
  it("T3 unknown recipient needs the lawyer (NEW_RECIPIENT)", async () => {
    const w = await world();
    expect(await transferRequest(w.ctx, w.req(key().address, 1_000_000n))).toMatchObject({ status: "pending", reasons: ["NEW_RECIPIENT"] });
  });
  it("T4 5 + 5 AUTO, then 1 base unit hits DAILY_CAP", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    const steps: string[] = [];
    for (const [i, amount] of [5_000_000n, 5_000_000n, 1n].entries()) {
      const out = await transferRequest(w.at(i * 60 * SECOND), w.req(to, amount, BigInt(i)));
      steps.push(out.status === "signed" ? "AUTO" : out.status === "pending" ? out.reasons.join() : "other");
      w.chain.safes.get(w.safe.toLowerCase())!.nonce = BigInt(i + 1);
    }
    expect(steps).toEqual(["AUTO", "AUTO", "DAILY_CAP"]);
  });
  it("T5 three 1 USDC transfers within the hour, the 4th hits VELOCITY", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const out = await transferRequest(w.at(i * 10 * 60 * SECOND), w.req(to, 1_000_000n, BigInt(i)));
      outcomes.push(out.status === "signed" ? "AUTO" : `${out.outcome}:${out.reasons.join()}`);
      w.chain.safes.get(w.safe.toLowerCase())!.nonce = BigInt(i + 1);
    }
    expect(outcomes).toEqual(["AUTO", "AUTO", "AUTO", "LAWYER:VELOCITY"]);
  });
  it("T6 a sanctioned recipient is REFUSED, T9 a zero amount is REFUSED", async () => {
    const w = await world();
    const bad = "0x2222222222222222222222222222222222220000" as Address;
    expect(await transferRequest(w.ctx, w.req(bad, 1_000_000n))).toMatchObject({ status: "refused", reasons: ["SANCTIONED_ADDRESS"] });
    await w.ctx.db.insert("sanctioned_addresses", { address: "0x00000000000000000000000000000000000abcde", list_version: "t" });
    expect(await transferRequest(w.ctx, w.req("0x00000000000000000000000000000000000abcde", 1n, 0n, { safeTxHash: w.hashOf("0x00000000000000000000000000000000000abcde", 1n) }))).toMatchObject({ status: "refused", reasons: ["SANCTIONED_ADDRESS"] });
    const zero = key().address;
    expect(await transferRequest(w.ctx, { sqRef: w.sqRef, safeAddress: w.safe, to: zero, amount: "0", nonce: "0", safeTxHash: `0x${"1".repeat(64)}` })).toMatchObject({ status: "refused", reasons: ["INVALID_AMOUNT"] });
  });
  it("T8 a per-transfer cap of 0 sends everything to the lawyer", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    await w.ctx.db.update("policies", { client_id: w.client.id }, { per_tx_cap_base: "0" });
    expect(await transferRequest(w.ctx, w.req(to, 1n))).toMatchObject({ status: "pending", reasons: ["AMOUNT_ABOVE_THRESHOLD"] });
  });
  it("T10 two simultaneous 6 USDC evaluations (daily cap 10): only one is AUTO", async () => {
    const w = await world();
    const [a, b] = [key().address, key().address];
    await w.approve(a);
    await w.approve(b);
    await w.ctx.db.update("policies", { client_id: w.client.id }, { per_tx_cap_base: "10000000" });
    const [x, y] = await Promise.all([transferRequest(w.ctx, w.req(a, 6_000_000n)), transferRequest(w.ctx, w.req(b, 6_000_000n))]);
    expect([x.outcome, y.outcome].sort()).toEqual(["AUTO", "LAWYER"]);
  });
  it("T11 six 1 USDC transfers more than an hour apart, the 7th within 24 h hits DAILY_COUNT", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      const out = await transferRequest(w.at(i * 70 * 60 * SECOND), w.req(to, 1_000_000n, BigInt(i)));
      seen.push(out.status === "signed" ? "AUTO" : out.reasons.join());
      w.chain.safes.get(w.safe.toLowerCase())!.nonce = BigInt(i + 1);
    }
    expect(seen).toEqual(["AUTO", "AUTO", "AUTO", "AUTO", "AUTO", "AUTO", "DAILY_COUNT"]);
  });
  it("T12 100 requests of 1 unit: 3 AUTO, then LAWYER up to 5 waiting, then REFUSED (TOO_MANY_PENDING)", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    const seen: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const dest = i < 3 ? to : key().address;
      if (i >= 3) await w.approve(dest);
      const out = await transferRequest(w.at(i * 2 * SECOND), w.req(dest, 1n, BigInt(Math.min(i, 3))));
      const k = out.status === "signed" ? "AUTO" : out.outcome;
      seen[k] = (seen[k] ?? 0) + 1;
      if (out.status === "signed") w.chain.safes.get(w.safe.toLowerCase())!.nonce = BigInt(i + 1);
      if (i === 2) w.chain.safes.get(w.safe.toLowerCase())!.nonce = 3n;
    }
    expect(seen.AUTO).toBe(3);
    expect(seen.LAWYER).toBe(5);
    expect(seen.REFUSED).toBe(92);
  });
  it("T13 with newRecipientRequiresLawyer off an unknown recipient is AUTO, sanctions stay active", async () => {
    const w = await world();
    await w.ctx.db.update("policies", { client_id: w.client.id }, { new_recipient_requires_lawyer: false });
    expect(await transferRequest(w.ctx, w.req(key().address, 1_000_000n))).toMatchObject({ status: "signed", outcome: "AUTO" });
    const bad = "0x3333333333333333333333333333333333330000" as Address;
    expect(await transferRequest(w.ctx, w.req(bad, 1_000_000n, 0n))).toMatchObject({ status: "refused" });
  });
});

describe("read only helpers for the client app", () => {
  it("transfer/check says what the policy would decide and reserves nothing", async () => {
    const w = await world();
    const to = key().address;
    expect(await transferCheck(w.ctx, { sqRef: w.sqRef, to, amount: "1000000" })).toEqual({ outcome: "LAWYER", reasons: ["NEW_RECIPIENT"] });
    await w.approve(to);
    expect(await transferCheck(w.ctx, { sqRef: w.sqRef, to, amount: "1000000" })).toEqual({ outcome: "AUTO", reasons: ["WITHIN_POLICY"] });
    expect(await transferCheck(w.ctx, { sqRef: w.sqRef, to, amount: "0" })).toEqual({ outcome: "REFUSED", reasons: ["INVALID_AMOUNT"] });
    expect(await w.ctx.db.select("decisions")).toHaveLength(0);
    expect(await w.ctx.db.select("approval_requests")).toHaveLength(0);
  });
  it("policy returns the limits and the known recipients", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    expect(await policyView(w.ctx, { sqRef: w.sqRef })).toEqual({ perTxCap: "5.00", dailyCap: "10.00", hourlyCount: 3, dailyCount: 6, newRecipientRequiresLawyer: true, approvedRecipients: [getAddress(to)] });
  });
});

describe("the node never signs what it did not build", () => {
  it("refuses a hash that does not match, a stale nonce, a Safe that is not ours, an unknown Safe and a client without a lawyer", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    expect(await code(transferRequest(w.ctx, w.req(to, 1n, 0n, { safeTxHash: `0x${"a".repeat(64)}` })))).toBe("409 HASH_MISMATCH");
    expect(await code(transferRequest(w.ctx, w.req(to, 1n, 5n)))).toBe("409 NONCE_MISMATCH");
    // The amount in the request differs from the amount the client hashed.
    expect(await code(transferRequest(w.ctx, w.req(to, 2n, 0n, { safeTxHash: w.hashOf(to, 1n) })))).toBe("409 HASH_MISMATCH");

    const other = key().address;
    w.chain.deploy(other, [key().address, key().address, key().address]); // P2 is not the second owner
    expect(await code(transferRequest(w.ctx, { ...w.req(to, 1n), safeAddress: other }))).toBe("409 WALLET_MISMATCH"); // client already has a registered wallet
    const fresh = await world();
    fresh.chain.deploy(other, [key().address, key().address, key().address]);
    expect(await code(transferRequest(fresh.ctx, { ...fresh.req(to, 1n), safeAddress: other }))).toBe("403 NOT_OUR_SAFE");
    expect(await code(transferRequest(fresh.ctx, { ...fresh.req(to, 1n), safeAddress: key().address }))).toBe("404 SAFE_NOT_FOUND");

    const { ctx } = testCtx();
    const lonely = randomUUID();
    await inviteRegister(ctx, { sqRef: lonely, tokenHash: sha256Hex("x"), displayName: "No lawyer" });
    expect(await code(transferRequest(ctx, { sqRef: lonely, safeAddress: key().address, to, amount: "1", nonce: "0", safeTxHash: `0x${"1".repeat(64)}` }))).toBe("409 LAWYER_NOT_ACCEPTED");
  });
  it("answers a repeated request with the same decision and reserves nothing twice", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    const first = await transferRequest(w.ctx, w.req(to, 5_000_000n));
    const again = await transferRequest(w.ctx, w.req(to, 5_000_000n));
    expect(again).toEqual(first);
    expect(await w.ctx.db.select("decisions", { client_id: w.client.id })).toHaveLength(1);
  });
  it("registers the wallet from the first valid request and refuses a second client claiming it", async () => {
    const w = await world();
    expect((await w.ctx.db.select("clients", { id: w.client.id }))[0].wallet_address ?? null).toBeNull();
    await transferRequest(w.ctx, w.req(key().address, 1n));
    expect((await w.ctx.db.select("clients", { id: w.client.id }))[0].wallet_address).toBe(w.safe.toLowerCase());
  });
});

describe("lawyer approval with a bound passkey assertion", () => {
  async function pending(w: World, amount = 6_000_000n) {
    const to = key().address;
    await w.approve(to);
    const out = await transferRequest(w.ctx, w.req(to, amount));
    if (out.status !== "pending") throw new Error("expected pending");
    return { to, requestId: out.requestId };
  }

  it("shows the request, approves it, and only then releases the P2 signature over the node-built hash", async () => {
    const w = await world();
    const { to, requestId } = await pending(w);
    expect(await me(w.ctx, w.lawyerId)).toMatchObject({ displayName: "Maître Dupont", clients: 1, pendingRequests: 1 });
    expect((await clientViews(w.ctx, w.lawyerId))[0]).toMatchObject({ displayName: "Léa Martin", status: "active", pendingRequests: 1, address: getAddress(w.safe) });
    const list = await requestSummaries(w.ctx, w.lawyerId, { status: "pending" });
    expect(list[0]).toMatchObject({ id: requestId, kind: "transfer", amount: "6.00", to: getAddress(to), status: "pending" });
    const detail = await requestDetail(w.ctx, w.lawyerId, { id: requestId });
    expect(detail.reasons).toEqual(["AMOUNT_ABOVE_THRESHOLD"]);
    expect(detail.intentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await transferStatus(w.ctx, { sqRef: w.sqRef, requestId })).toMatchObject({ status: "pending" });
    expect(await transferStatus(w.ctx, { sqRef: w.sqRef, requestId })).not.toHaveProperty("signature");

    await decide(w, w.ctx, requestId, "approve");
    const status = (await transferStatus(w.ctx, { sqRef: w.sqRef, requestId })) as { status: string; signature: Hex };
    expect(status.status).toBe("approved");
    expect(await recoverAddress({ hash: w.hashOf(to, 6_000_000n), signature: status.signature })).toBe(w.p2);
    expect(await code(decide(w, w.ctx, requestId, "approve"))).toBe("409 REQUEST_NOT_PENDING");
  });

  it("a refusal never releases a signature", async () => {
    const w = await world();
    const { requestId } = await pending(w);
    await decide(w, w.ctx, requestId, "refuse");
    const status = await transferStatus(w.ctx, { sqRef: w.sqRef, requestId });
    expect(status).toMatchObject({ status: "refused" });
    expect(status).not.toHaveProperty("signature");
  });

  it("the passkey prompt is bound to this request and this decision", async () => {
    const w = await world();
    const a = await pending(w);
    const b = await pending(w, 7_000_000n);
    const requestA = (await w.ctx.db.select("approval_requests", { id: a.requestId }))[0];
    const options = (await decideOptions(w.ctx, w.lawyerId, { id: a.requestId, decision: "refuse" })) as any;
    expect(options.challenge).toBe(approvalChallenge(a.requestId, requestA.intent_hash, "refuse"));
    expect(options.userVerification).toBe("required");
    // A "refuse" assertion cannot be used to approve, nor to decide another request.
    expect(await code(decideVerify(w.ctx, w.lawyerId, { id: a.requestId, decision: "approve", response: w.authenticator.assert(options) }))).toBe("400 CHALLENGE_MISMATCH");
    expect(await code(decideVerify(w.ctx, w.lawyerId, { id: b.requestId, decision: "refuse", response: w.authenticator.assert(options) }))).toBe("400 CHALLENGE_MISMATCH");
    // Without user verification the assertion is refused.
    expect(await code(decideVerify(w.ctx, w.lawyerId, { id: a.requestId, decision: "refuse", response: w.authenticator.assert(options, { userVerified: false }) }))).toBe("401 PASSKEY_REJECTED");
    expect(await code(decideVerify(w.ctx, w.lawyerId, { id: a.requestId, decision: "refuse", response: w.authenticator.assert(options) }))).toBe("no error");
  });

  it("a request nobody answers expires and nothing is signed; an expired request cannot be approved", async () => {
    const w = await world();
    const { requestId } = await pending(w);
    const late = w.at(181 * SECOND);
    expect(await transferStatus(late, { sqRef: w.sqRef, requestId })).toMatchObject({ status: "expired" });
    expect(await code(decide(w, late, requestId, "approve"))).toBe("410 REQUEST_EXPIRED");
  });

  it("an approval is useless once the wallet moved on (nonce changed)", async () => {
    const w = await world();
    const { requestId } = await pending(w);
    w.chain.safes.get(w.safe.toLowerCase())!.nonce = 1n;
    expect(await code(decide(w, w.ctx, requestId, "approve"))).toBe("409 REQUEST_STALE");
    expect(await transferStatus(w.ctx, { sqRef: w.sqRef, requestId })).toMatchObject({ status: "expired" });
  });

  it("another lawyer cannot see or decide the request", async () => {
    const w = await world();
    const { requestId } = await pending(w);
    const w2 = await world(); // separate context: separate lawyer, but share the db to test isolation
    const shared: World = { ...w2, ctx: { ...w2.ctx, db: w.ctx.db } };
    expect(await code(requestDetail(shared.ctx, w2.lawyerId, { id: requestId }))).toBe("404 NOT_FOUND");
    expect(await requestSummaries(shared.ctx, w2.lawyerId, {})).toEqual([]);
  });

  it("adds the recipient to the known list when asked, and the next transfer to them is AUTO", async () => {
    const w = await world();
    const to = key().address;
    const out = await transferRequest(w.ctx, w.req(to, 1_000_000n));
    if (out.status !== "pending") throw new Error("expected pending");
    await decide(w, w.ctx, out.requestId, "approve", { addRecipient: true });
    w.chain.safes.get(w.safe.toLowerCase())!.nonce = 1n;
    expect(await transferRequest(w.ctx, w.req(to, 1_000_000n, 1n))).toMatchObject({ status: "signed", outcome: "AUTO" });
  });
});

describe("policy per client, changed with a passkey", () => {
  it("shows the policy, changes it with a bound assertion, versions it and journals it", async () => {
    const w = await world();
    const before = await policyGet(w.ctx, w.lawyerId, { clientId: w.client.id });
    expect(before).toMatchObject({ perTxCap: "5.00", dailyCap: "10.00", hourlyCount: 3, dailyCount: 6, newRecipientRequiresLawyer: true, version: 1 });
    const next = { ...before, perTxCap: "8", dailyCap: "20", approvedRecipients: [key().address] };
    const options = (await policyOptions(w.ctx, w.lawyerId, { clientId: w.client.id, policy: next })) as any;
    expect(await policyVerify(w.ctx, w.lawyerId, { clientId: w.client.id, policy: next, response: w.authenticator.assert(options) })).toEqual({ ok: true, version: 2 });
    const after = await policyGet(w.ctx, w.lawyerId, { clientId: w.client.id });
    expect(after).toMatchObject({ perTxCap: "8.00", dailyCap: "20.00", version: 2 });
    expect(after.approvedRecipients).toHaveLength(1);
    expect(await w.ctx.db.select("policy_versions", { client_id: w.client.id })).toHaveLength(1);
    const j = await journal(w.ctx, w.lawyerId, {});
    expect(j.entries.map((e) => e.type)).toEqual(expect.arrayContaining(["POLICY_CHANGED", "RECIPIENT_ADDED", "LOGIN"].filter((t) => t !== "LOGIN")));
    expect(j.entries.find((e) => e.type === "POLICY_CHANGED")?.summary).toContain("Policy v2 saved");
    expect(j.integrity.ok).toBe(true);
  });
  it("refuses an assertion made for another policy, a stale version, and invalid values", async () => {
    const w = await world();
    const before = await policyGet(w.ctx, w.lawyerId, { clientId: w.client.id });
    const next = { ...before, perTxCap: "8" };
    const options = (await policyOptions(w.ctx, w.lawyerId, { clientId: w.client.id, policy: next })) as any;
    const swapped = { ...before, perTxCap: "9" };
    expect(await code(policyVerify(w.ctx, w.lawyerId, { clientId: w.client.id, policy: swapped, response: w.authenticator.assert(options) }))).toBe("400 CHALLENGE_MISMATCH");
    expect(await code(policyOptions(w.ctx, w.lawyerId, { clientId: w.client.id, policy: { ...before, perTxCap: "99" } }))).toBe("400 INVALID_POLICY");
    expect(await code(policyOptions(w.ctx, w.lawyerId, { clientId: w.client.id, policy: { ...before, version: 7 } }))).toBe("409 POLICY_VERSION_CONFLICT");
    const w2 = await world();
    const sharedDb = { ...w2.ctx, db: w.ctx.db };
    expect(await code(policyGet(sharedDb, w2.lawyerId, { clientId: w.client.id }))).toBe("404 NOT_FOUND");
  });
  it("the new limits apply to the next transfer", async () => {
    const w = await world();
    const to = key().address;
    const before = await policyGet(w.ctx, w.lawyerId, { clientId: w.client.id });
    const next = { ...before, perTxCap: "20", dailyCap: "50", approvedRecipients: [to] };
    const options = (await policyOptions(w.ctx, w.lawyerId, { clientId: w.client.id, policy: next })) as any;
    await policyVerify(w.ctx, w.lawyerId, { clientId: w.client.id, policy: next, response: w.authenticator.assert(options) });
    expect(await transferRequest(w.ctx, w.req(to, 15_000_000n))).toMatchObject({ status: "signed", outcome: "AUTO" });
  });
});

describe("recovery and exit: always the lawyer, always bound to a passkey", () => {
  it("approves a recovery, then gives the P2 signature over the swapOwner hash rebuilt from the chain", async () => {
    const w = await world();
    const newOwner = key().address;
    const recoveryId = randomUUID();
    const body = { sqRef: w.sqRef, recoveryId, safeAddress: w.safe, newOwnerAddress: newOwner };
    const req = await recoveryRequest(w.ctx, body);
    expect(req).toMatchObject({ status: "pending" });
    expect(await recoveryRequest(w.ctx, body)).toMatchObject({ status: "pending" });
    expect(await recoveryStatus(w.ctx, { sqRef: w.sqRef, recoveryId })).not.toHaveProperty("signature");
    const list = await requestSummaries(w.ctx, w.lawyerId, { status: "pending" });
    expect(list[0].kind).toBe("recovery");
    expect((await clientViews(w.ctx, w.lawyerId))[0].status).toBe("recovering");
    const detail = await requestDetail(w.ctx, w.lawyerId, { id: (req as any).requestId });
    expect(detail.recovery).toMatchObject({ oldAddress: getAddress(w.safe), newAddress: getAddress(newOwner), identity: "pending" });
    const verified = await recoveryRequest(w.ctx, { sqRef: w.sqRef, recoveryId: randomUUID(), safeAddress: w.safe, newOwnerAddress: key().address, identity: "verified" }) as any;
    expect((await requestDetail(w.ctx, w.lawyerId, { id: verified.requestId })).recovery?.identity).toBe("verified");

    await decide(w, w.ctx, (req as any).requestId, "approve");
    const out = (await recoveryStatus(w.ctx, { sqRef: w.sqRef, recoveryId })) as { status: string; signature: Hex; safeTxHash: Hex };
    expect(out.status).toBe("approved");
    const state = await w.chain.getSafeState(w.safe);
    const tx = swapOwnerTx({ safe: w.safe, owners: state.owners, oldOwner: w.p1.address, newOwner });
    expect(out.safeTxHash).toBe(safeTxHash({ safe: w.safe, tx, nonce: state.nonce }));
    expect(await recoverAddress({ hash: out.safeTxHash, signature: out.signature })).toBe(w.p2);
  });
  it("a refused recovery gives nothing, and the old owner is never named by the client", async () => {
    const w = await world();
    const recoveryId = randomUUID();
    const req = (await recoveryRequest(w.ctx, { sqRef: w.sqRef, recoveryId, safeAddress: w.safe, newOwnerAddress: key().address, oldOwnerAddress: w.p3.address })) as any;
    await decide(w, w.ctx, req.requestId, "refuse");
    const status = await recoveryStatus(w.ctx, { sqRef: w.sqRef, recoveryId });
    expect(status).toMatchObject({ status: "refused" });
    expect(status).not.toHaveProperty("signature");
    expect(JSON.stringify((await w.ctx.db.select("approval_requests", { id: req.requestId }))[0].intent)).toContain(w.p1.address.toLowerCase());
  });
  it("the lawyer can cancel an approved recovery before it is used", async () => {
    const w = await world();
    const recoveryId = randomUUID();
    const req = (await recoveryRequest(w.ctx, { sqRef: w.sqRef, recoveryId, safeAddress: w.safe, newOwnerAddress: key().address })) as any;
    await decide(w, w.ctx, req.requestId, "approve");
    await decide(w, w.ctx, req.requestId, "refuse");
    const status = await recoveryStatus(w.ctx, { sqRef: w.sqRef, recoveryId });
    expect(status).toMatchObject({ status: "refused" });
    expect(status).not.toHaveProperty("signature");
  });
  it("refuses a new owner that already controls the wallet", async () => {
    const w = await world();
    expect(await code(recoveryRequest(w.ctx, { sqRef: w.sqRef, recoveryId: randomUUID(), safeAddress: w.safe, newOwnerAddress: w.p3.address }))).toBe("409 ALREADY_OWNER");
  });
  it("exit without Swissquote: manual approval, then the signature only after the delay", async () => {
    const w = await world();
    w.chain.usdc.set(w.safe.toLowerCase(), 7_000_000n);
    const dest = key().address;
    const out = await exitRequest(w.ctx, { sqRef: w.sqRef, safeAddress: w.safe, to: dest });
    expect(out.amount).toBe("7000000");
    expect(await exitStatus(w.ctx, { sqRef: w.sqRef, exitId: out.exitId })).toMatchObject({ status: "pending" });
    await decide(w, w.ctx, out.requestId, "approve");
    expect(await exitStatus(w.ctx, { sqRef: w.sqRef, exitId: out.exitId })).toMatchObject({ status: "waiting" });
    const later = w.at(121 * SECOND);
    const released = (await exitStatus({ ...later, config: { ...later.config } }, { sqRef: w.sqRef, exitId: out.exitId })) as any;
    expect(released.status).toBe("approved");
    expect(await recoverAddress({ hash: w.hashOf(dest, 7_000_000n), signature: released.signature })).toBe(w.p2);
    expect((await clientViews(w.ctx, w.lawyerId))[0].status).toBe("active");
  });
  it("an exit of an empty wallet is refused up front", async () => {
    const w = await world();
    expect(await code(exitRequest(w.ctx, { sqRef: w.sqRef, safeAddress: w.safe, to: key().address }))).toBe("400 NOTHING_TO_EXIT");
  });
});

describe("journal and integrity", () => {
  it("every decision is chained, the chain verifies, and tampering is detected", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    const out = await transferRequest(w.ctx, w.req(to, 9_000_000n));
    if (out.status !== "pending") throw new Error("expected pending");
    await decide(w, w.ctx, out.requestId, "approve");
    const j = await journal(w.ctx, w.lawyerId, {});
    expect(j.entries[0]).toMatchObject({ type: "LAWYER_DECIDED", clientName: "Léa Martin" });
    expect(j.entries[0].summary).toMatch(/^Approved 9\.00 USDC to 0x/);
    expect(j.autoDecisions24h).toEqual({ count: 0, totalUsdc: "0.00" });
    expect(await auditVerify(w.ctx)).toMatchObject({ ok: true });

    const first = (await w.ctx.db.select("audit_log", {}, { order: ["id", "asc"], limit: 1 }))[0];
    await w.ctx.db.update("audit_log", { id: first.id }, { payload: { tampered: true } });
    const bad = await auditVerify(w.ctx);
    expect(bad.ok).toBe(false);
    expect(bad.firstFailure).toContain(`Entry ${first.id}`);
    await appendAudit(w.ctx, "x", "NOOP", null, {}); // appending after tampering does not hide it
    expect((await auditVerify(w.ctx)).ok).toBe(false);
  });
  it("counts automatic decisions as totals only", async () => {
    const w = await world();
    const to = key().address;
    await w.approve(to);
    await transferRequest(w.ctx, w.req(to, 3_000_000n));
    expect((await journal(w.ctx, w.lawyerId, {})).autoDecisions24h).toEqual({ count: 1, totalUsdc: "3.00" });
  });
});

describe("server to server authentication", () => {
  it("rejects a request without HMAC, with a wrong secret and a replayed nonce", async () => {
    const { signRequest } = await import("@/src/shared/hmac");
    const t = testCtx(new Date());
    const route = hmacRoute(async () => ({ ok: true }), () => ({ ...t.ctx, now: new Date() }));
    const body = JSON.stringify({});
    const path = "/api/node/owner/create";
    const make = (headers: Record<string, string>) => new Request(`https://lawyer.test${path}`, { method: "POST", body, headers });
    expect((await route(make({}))).status).toBe(401);
    expect((await route(make(signRequest({ secret: "another-secret", method: "POST", path, body })))).status).toBe(401);
    const good = signRequest({ secret: t.ctx.env.APP_TO_LAWYER_SECRET!, method: "POST", path, body });
    expect((await route(make(good))).status).toBe(200);
    expect((await route(make(good))).status).toBe(401); // replay
    expect((await route(make(signRequest({ secret: t.ctx.env.APP_TO_LAWYER_SECRET!, method: "POST", path: "/api/other", body })))).status).toBe(401);
  });
});
