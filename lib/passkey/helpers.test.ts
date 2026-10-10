import { describe, expect, it } from "vitest";
import { buildCreationOptions, detectInAppBrowser, HKDF_INFO_LABEL, interpretCapabilities, mapWebAuthnError, planAfterCreate, PRF_SALT_LABEL, prfSalt, rpIdProblem } from "./helpers";

const bytes = (n: number) => new Uint8Array(new ArrayBuffer(n));

describe("mapWebAuthnError", () => {
  it.each([
    ["NotAllowedError", "retry"],
    ["SecurityError", "retry"],
    ["NotSupportedError", "retry"],
    ["InvalidStateError", "sign_in_existing"],
  ])("%s", (name, action) => {
    const info = mapWebAuthnError({ name, message: "x" });
    expect(info.action).toBe(action);
    expect(info.name).toBe(name);
  });
  it("unknown errors keep the name and no stack", () => {
    const info = mapWebAuthnError(Object.assign(new Error("boom"), { name: "WeirdError" }));
    expect(info.message).toContain("WeirdError");
    expect(JSON.stringify(info)).not.toContain("boom");
  });
  it("non-objects do not throw", () => expect(mapWebAuthnError(null).name).toBe("UnknownError"));
});

describe("detectInAppBrowser", () => {
  it("flags in-app browsers and webviews", () => {
    expect(detectInAppBrowser("Mozilla/5.0 (iPhone) AppleWebKit [FBAN/FBIOS;FBAV/400]")).toBe("Facebook");
    expect(detectInAppBrowser("Mozilla/5.0 (iPhone) Instagram 300.0")).toBe("Instagram");
    expect(detectInAppBrowser("Mozilla/5.0 (Linux; Android 13; Redmi) Chrome/120 Mobile MiuiBrowser/17.0")).toBe("MIUI Browser");
    expect(detectInAppBrowser("Mozilla/5.0 (Linux; Android 13; Redmi; wv) Version/4.0 Chrome/120 Mobile Safari/537.36")).toBe("Android WebView");
  });
  it("lets normal browsers through", () => {
    expect(detectInAppBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Version/18.0 Mobile Safari/604.1")).toBeNull();
    expect(detectInAppBrowser("Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit Chrome/126.0 Mobile Safari/537.36")).toBeNull();
  });
});

describe("rpIdProblem", () => {
  it("rejects localhost, IPs and insecure pages", () => {
    expect(rpIdProblem("localhost", true)).not.toBeNull();
    expect(rpIdProblem("192.168.1.20", true)).not.toBeNull();
    expect(rpIdProblem("sq-keys-iota.vercel.app", false)).not.toBeNull();
  });
  it("accepts an HTTPS hostname", () => expect(rpIdProblem("sq-keys-iota.vercel.app", true)).toBeNull());
});

describe("interpretCapabilities", () => {
  const ok = { secureContext: true, hasPublicKeyCredential: true, platformAuthenticator: true, prfReported: true };
  it("usable when everything is present", () => expect(interpretCapabilities(ok)).toEqual({ usable: true, advice: [] }));
  it("no platform authenticator: not usable, mentions screen lock", () => {
    const r = interpretCapabilities({ ...ok, platformAuthenticator: false });
    expect(r.usable).toBe(false);
    expect(r.advice.join(" ")).toContain("screen lock");
  });
  it("unknown platform check does not block", () => expect(interpretCapabilities({ ...ok, platformAuthenticator: null }).usable).toBe(true));
  it("PRF not reported stays usable but warns", () => {
    const r = interpretCapabilities({ ...ok, prfReported: false });
    expect(r.usable).toBe(true);
    expect(r.advice).toHaveLength(1);
  });
});

describe("creation options", () => {
  const base = { rpId: "sq-keys-iota.vercel.app", challenge: bytes(32), userId: bytes(16), userName: "SQ Keys client", excludeIds: [bytes(8)] };
  it("follows CDC section 6", () => {
    const o = buildCreationOptions(base);
    expect(o.rp.id).toBe("sq-keys-iota.vercel.app");
    expect(o.pubKeyCredParams?.map((p) => p.alg)).toEqual([-7, -257]);
    expect(o.authenticatorSelection).toMatchObject({ authenticatorAttachment: "platform", residentKey: "required", requireResidentKey: true, userVerification: "required" });
    expect(o.attestation).toBe("none");
    expect(o.timeout).toBe(60000);
    expect(o.excludeCredentials).toHaveLength(1);
  });
  it("rejects a user.id over 64 bytes", () => expect(() => buildCreationOptions({ ...base, userId: bytes(65) })).toThrow());
});

describe("PRF plan and constants", () => {
  it("plans", () => {
    expect(planAfterCreate({ enabled: true, hasResult: true })).toBe("ready");
    expect(planAfterCreate({ enabled: true, hasResult: false })).toBe("needs_second_tap");
    expect(planAfterCreate({ enabled: false, hasResult: false })).toBe("unsupported");
  });
  it("labels are frozen", () => {
    expect(PRF_SALT_LABEL).toBe("sqkeys/prf-salt/v1");
    expect(HKDF_INFO_LABEL).toBe("sqkeys/p1-wrapping-key/v1");
    expect(new TextDecoder().decode(prfSalt())).toBe(PRF_SALT_LABEL);
  });
});
