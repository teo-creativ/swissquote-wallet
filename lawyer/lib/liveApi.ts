// Live bodies of lib/lawyerApi.ts (NEXT_PUBLIC_LAWYER_MODE=live): real calls to the portal routes (/api/portal/*) with the session cookie.
// Decisions and policy changes run a real WebAuthn assertion whose challenge the server computed from the exact request or policy.
// Browser code: no secret here, and nothing from lib/server is imported.
import type { ClientView, JournalView, PolicyEdit, RequestDetail, RequestStatus, RequestSummary } from "./lawyerApi.types";
import { LawyerApiError } from "./lawyerApi.types";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as Record<string, any> | null;
  if (!res.ok) {
    throw new LawyerApiError(data?.error?.code ?? `HTTP_${res.status}`, data?.error?.message ?? "Something went wrong. Nothing was changed. Try again.");
  }
  return data as T;
}
const qs = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

/** Runs the passkey prompt for options the server built. A cancelled prompt is not an error screen, just a message. */
async function assertion(optionsJSON: unknown) {
  const { startAuthentication, browserSupportsWebAuthn } = await import("@simplewebauthn/browser");
  if (!browserSupportsWebAuthn()) throw new LawyerApiError("PASSKEY_UNSUPPORTED", "This browser cannot use a passkey. Try another browser.");
  try {
    return await startAuthentication({ optionsJSON: optionsJSON as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "NotAllowedError" || name === "AbortError") throw new LawyerApiError("PASSKEY_CANCELLED", "The passkey prompt was cancelled. Nothing was changed.");
    throw new LawyerApiError("PASSKEY_FAILED", "Your device could not use the passkey. Nothing was changed.");
  }
}

export function inspectInvitation(token: string): Promise<{ valid: boolean; clientDisplayName: string; expiresAt: string }> {
  return call("/api/invite/inspect", { token });
}
export function getMe(): Promise<{ displayName: string; clients: number; pendingRequests: number }> {
  return call("/api/portal/me");
}
export function getClients(): Promise<ClientView[]> {
  return call("/api/portal/clients");
}
export function getRequests(status?: RequestStatus): Promise<RequestSummary[]> {
  return call(`/api/portal/requests${qs({ status })}`);
}
export function getRequest(id: string): Promise<RequestDetail> {
  return call(`/api/portal/request${qs({ id })}`);
}
export async function decide(id: string, decision: "approve" | "refuse", opts?: { addRecipient?: boolean }): Promise<void> {
  const options = await call<unknown>("/api/portal/decide/options", { id, decision });
  const response = await assertion(options);
  await call("/api/portal/decide/verify", { id, decision, addRecipient: opts?.addRecipient === true, response });
}
export function getPolicy(clientId: string): Promise<PolicyEdit> {
  return call(`/api/portal/policy${qs({ clientId })}`);
}
export async function updatePolicy(clientId: string, policy: PolicyEdit): Promise<void> {
  const options = await call<unknown>("/api/portal/policy/options", { clientId, policy });
  const response = await assertion(options);
  await call("/api/portal/policy/verify", { clientId, policy, response });
}
export function getJournal(limit?: number): Promise<JournalView> {
  return call(`/api/portal/journal${qs({ limit })}`);
}
export function verifyAudit(): Promise<{ ok: boolean; checkedEntries: number; firstFailure?: string }> {
  return call("/api/portal/audit/verify", {});
}
