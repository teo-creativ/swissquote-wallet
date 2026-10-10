// Real WebAuthn calls for the lawyer portal (CDC annex A.2). Used only when NEXT_PUBLIC_LAWYER_MODE=live.
// Mock mode never reaches this file: lawyerApi.mock.ts simulates the prompt with a timer.
// The browser library is loaded on demand so it stays out of the bundle until a passkey is needed.
import { LawyerApiError } from "./lawyerApi.types";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, any> | null;
  if (!res.ok) {
    throw new LawyerApiError(
      data?.error?.code ?? data?.code ?? `HTTP_${res.status}`,
      data?.error?.message ?? data?.message ?? "Something went wrong. Try again.",
    );
  }
  return data as T;
}

/** Turns a browser or library failure into a message a lawyer can act on. */
function passkeyError(e: unknown): LawyerApiError {
  if (e instanceof LawyerApiError) return e;
  const names = [e, e instanceof Error ? e.cause : undefined].map((x) => (x instanceof Error ? x.name : ""));
  if (names.includes("NotAllowedError") || names.includes("AbortError")) {
    return new LawyerApiError("PASSKEY_CANCELLED", "The passkey prompt was cancelled. Try again.");
  }
  if (names.includes("InvalidStateError")) {
    return new LawyerApiError("PASSKEY_EXISTS", "This device already has a passkey for the portal. Sign in instead.");
  }
  return new LawyerApiError("PASSKEY_FAILED", "Your device could not use a passkey. Try another browser or a security key.");
}

/** L2: creates the lawyer account and its passkey (A.2 register/options + register/verify). */
export async function registerLawyer(token: string, i: { displayName: string; firm: string }): Promise<void> {
  const { startRegistration, browserSupportsWebAuthn } = await import("@simplewebauthn/browser");
  if (!browserSupportsWebAuthn()) {
    throw new LawyerApiError("PASSKEY_UNSUPPORTED", "This browser cannot create a passkey. Try another browser.");
  }
  const optionsJSON = await post<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/webauthn/register/options", {
    token,
    displayName: i.displayName,
    firm: i.firm,
  });
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (e) {
    throw passkeyError(e);
  }
  await post("/api/webauthn/register/verify", { token, response });
}

/** L3: signs in with a passkey that is already registered (A.2 login/options + login/verify). */
export async function loginLawyer(): Promise<void> {
  const { startAuthentication, browserSupportsWebAuthn } = await import("@simplewebauthn/browser");
  if (!browserSupportsWebAuthn()) {
    throw new LawyerApiError("PASSKEY_UNSUPPORTED", "This browser cannot use a passkey. Try another browser.");
  }
  const optionsJSON = await post<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/webauthn/login/options", {});
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (e) {
    throw passkeyError(e);
  }
  await post("/api/webauthn/login/verify", { response });
}
