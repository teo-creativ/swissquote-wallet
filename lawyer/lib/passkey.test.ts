import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startRegistration = vi.fn();
const startAuthentication = vi.fn();
vi.mock("@simplewebauthn/browser", () => ({
  startRegistration: (...a: unknown[]) => startRegistration(...a),
  startAuthentication: (...a: unknown[]) => startAuthentication(...a),
  browserSupportsWebAuthn: () => true,
}));

import { loginLawyer, registerLawyer } from "./passkey";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fetchMock.mockReset();
});

describe("registerLawyer", () => {
  it("fetches options, runs the ceremony, then verifies", async () => {
    fetchMock.mockResolvedValueOnce(json({ challenge: "c" })).mockResolvedValueOnce(json({ lawyerId: "l1" }));
    startRegistration.mockResolvedValue({ id: "cred" });

    await registerLawyer("tok", { displayName: "Ada", firm: "Firm" });

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/webauthn/register/options", "/api/webauthn/register/verify"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: "tok", displayName: "Ada", firm: "Firm" });
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ token: "tok", response: { id: "cred" } });
  });

  it("maps a cancelled prompt to a readable error and never calls verify", async () => {
    fetchMock.mockResolvedValueOnce(json({ challenge: "c" }));
    startRegistration.mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" }));

    await expect(registerLawyer("tok", { displayName: "Ada", firm: "F" })).rejects.toMatchObject({ code: "PASSKEY_CANCELLED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces server errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "INVITATION_INVALID", message: "This invitation is no longer valid." } }, 410));
    await expect(registerLawyer("tok", { displayName: "Ada", firm: "F" })).rejects.toMatchObject({
      code: "INVITATION_INVALID",
      message: "This invitation is no longer valid.",
    });
  });
});

describe("loginLawyer", () => {
  it("runs authentication and verifies", async () => {
    fetchMock.mockResolvedValueOnce(json({ challenge: "c" })).mockResolvedValueOnce(json({}));
    startAuthentication.mockResolvedValue({ id: "cred" });
    await loginLawyer();
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/webauthn/login/options", "/api/webauthn/login/verify"]);
  });
});
