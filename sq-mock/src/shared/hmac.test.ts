import { describe, expect, it } from "vitest";
import { HMAC_HEADER_SIG, HMAC_HEADER_TS, MemoryNonceStore, signRequest, verifyRequest } from "./hmac";

const secret = "test-pair-secret";
const now = new Date("2026-10-11T02:00:00.000Z");
const body = JSON.stringify({ sqRef: "abc" });
const asHeaders = (h: Record<string, string>) => ({ get: (k: string) => h[k] ?? null });
const base = { secret, method: "POST", path: "/api/login", body };

describe("hmac", () => {
  it("accepts a correctly signed request", async () => {
    const headers = signRequest({ ...base, now });
    expect(await verifyRequest({ ...base, headers: asHeaders(headers), nonces: new MemoryNonceStore(), now })).toEqual({ ok: true });
  });

  it("uses a 16 byte hex nonce and an ISO timestamp", () => {
    const headers = signRequest({ ...base, now });
    expect(headers["x-sq-nonce"]).toMatch(/^[0-9a-f]{32}$/);
    expect(headers[HMAC_HEADER_TS]).toBe(now.toISOString());
  });

  it("rejects a replayed nonce", async () => {
    const nonces = new MemoryNonceStore();
    const headers = asHeaders(signRequest({ ...base, now }));
    expect((await verifyRequest({ ...base, headers, nonces, now })).ok).toBe(true);
    expect(await verifyRequest({ ...base, headers, nonces, now })).toEqual({ ok: false, reason: "REPLAYED_NONCE" });
  });

  it("rejects a tampered body, path or method", async () => {
    const headers = asHeaders(signRequest({ ...base, now }));
    const nonces = new MemoryNonceStore();
    for (const changed of [{ body: body + " " }, { path: "/api/kyc" }, { method: "GET" }])
      expect(await verifyRequest({ ...base, ...changed, headers, nonces, now })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a wrong secret and a malformed signature", async () => {
    const nonces = new MemoryNonceStore();
    const headers = signRequest({ ...base, now });
    expect(await verifyRequest({ ...base, secret: "other", headers: asHeaders(headers), nonces, now })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
    expect(await verifyRequest({ ...base, headers: asHeaders({ ...headers, [HMAC_HEADER_SIG]: "zz" }), nonces, now })).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("rejects a timestamp outside the 60 s window, in the past or in the future", async () => {
    const nonces = new MemoryNonceStore();
    const headers = asHeaders(signRequest({ ...base, now }));
    expect((await verifyRequest({ ...base, headers, nonces, now: new Date(now.getTime() + 59_000) })).ok).toBe(true);
    const other = asHeaders(signRequest({ ...base, now }));
    expect(await verifyRequest({ ...base, headers: other, nonces, now: new Date(now.getTime() + 61_000) })).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
    expect(await verifyRequest({ ...base, headers: other, nonces, now: new Date(now.getTime() - 61_000) })).toEqual({ ok: false, reason: "STALE_TIMESTAMP" });
  });

  it("does not burn the nonce when the signature is invalid", async () => {
    const nonces = new MemoryNonceStore();
    const headers = signRequest({ ...base, now });
    await verifyRequest({ ...base, secret: "other", headers: asHeaders(headers), nonces, now });
    expect((await verifyRequest({ ...base, headers: asHeaders(headers), nonces, now })).ok).toBe(true);
  });

  it("fails closed without a secret or without headers", async () => {
    const nonces = new MemoryNonceStore();
    const headers = asHeaders(signRequest({ ...base, now }));
    expect(await verifyRequest({ ...base, secret: undefined, headers, nonces, now })).toEqual({ ok: false, reason: "NOT_CONFIGURED" });
    expect(await verifyRequest({ ...base, headers: asHeaders({}), nonces, now })).toEqual({ ok: false, reason: "MISSING_HEADERS" });
    expect(() => signRequest({ ...base, secret: "" })).toThrow();
  });
});
