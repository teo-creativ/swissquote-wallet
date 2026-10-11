import { beforeAll, describe, expect, it } from "vitest";
import { signRequest } from "../src/shared/hmac";
import { hmacRoute } from "./http";
import { bankAccount, login } from "./services";
import { TEST_PASSWORD } from "./testkit";

const SECRET = "pair-secret-for-tests-only";
const ORIGIN = "http://localhost:3002";

beforeAll(() => {
  process.env.APP_TO_SQ_SECRET = SECRET;
  process.env.SQ_DEMO_PASSWORD = TEST_PASSWORD;
  delete process.env.SQ_SUPABASE_URL;
});

function post(path: string, body: unknown, headers?: Record<string, string>) {
  const raw = JSON.stringify(body);
  return new Request(ORIGIN + path, { method: "POST", body: raw, headers: headers ?? signRequest({ secret: SECRET, method: "POST", path, body: raw }) });
}
const credentials = { clientId: "client.lea", password: TEST_PASSWORD };

describe("hmac route wrapper", () => {
  it("rejects a request without HMAC headers", async () => {
    const res = await hmacRoute(login)(post("/api/login", credentials, {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "UNAUTHENTICATED", message: "Request authentication failed." } });
  });

  it("rejects a request signed with another secret or for another path", async () => {
    const raw = JSON.stringify(credentials);
    const wrongSecret = signRequest({ secret: "other", method: "POST", path: "/api/login", body: raw });
    expect((await hmacRoute(login)(post("/api/login", credentials, wrongSecret))).status).toBe(401);
    const wrongPath = signRequest({ secret: SECRET, method: "POST", path: "/api/kyc", body: raw });
    expect((await hmacRoute(login)(post("/api/login", credentials, wrongPath))).status).toBe(401);
  });

  it("accepts a signed request once and rejects the replayed nonce", async () => {
    const raw = JSON.stringify(credentials);
    const headers = signRequest({ secret: SECRET, method: "POST", path: "/api/login", body: raw });
    const first = await hmacRoute(login)(post("/api/login", credentials, headers));
    expect(first.status).toBe(200);
    const json = await first.json();
    expect(json).toMatchObject({ displayName: "Léa", simulated: true });
    expect(JSON.stringify(json)).not.toContain("scrypt");
    expect((await hmacRoute(login)(post("/api/login", credentials, headers))).status).toBe(401);
  });

  it("signs the query string of GET requests", async () => {
    const { sqRef } = await (await hmacRoute(login)(post("/api/login", credentials))).json();
    const path = `/api/bank-account?sqRef=${sqRef}`;
    const ok = await hmacRoute(bankAccount)(new Request(ORIGIN + path, { headers: signRequest({ secret: SECRET, method: "GET", path }) }));
    expect(await ok.json()).toEqual({ cashChf: 18165, simulated: true });
    const moved = signRequest({ secret: SECRET, method: "GET", path: "/api/bank-account?sqRef=other" });
    expect((await hmacRoute(bankAccount)(new Request(ORIGIN + path, { headers: moved }))).status).toBe(401);
  });

  it("maps validation errors and malformed JSON to 400 without internal details", async () => {
    expect((await hmacRoute(login)(post("/api/login", { clientId: "client.lea" }))).status).toBe(400);
    const raw = "{not json";
    const req = new Request(`${ORIGIN}/api/login`, { method: "POST", body: raw, headers: signRequest({ secret: SECRET, method: "POST", path: "/api/login", body: raw }) });
    const res = await hmacRoute(login)(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });

  it("fails closed when the pair secret is not configured", async () => {
    delete process.env.APP_TO_SQ_SECRET;
    expect((await hmacRoute(login)(post("/api/login", credentials, signRequest({ secret: SECRET, method: "POST", path: "/api/login", body: JSON.stringify(credentials) })))).status).toBe(401);
    process.env.APP_TO_SQ_SECRET = SECRET;
  });
});
