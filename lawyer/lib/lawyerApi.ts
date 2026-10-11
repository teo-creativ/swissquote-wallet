// Lawyer portal front contract (CDC annex D.2). The front imports ONLY this file (and its types).
// NEXT_PUBLIC_LAWYER_MODE=mock (default) runs on the in-memory mock. "live" calls the real portal routes (lib/liveApi.ts, server code in
// lib/server): signatures are unchanged.
import * as live from "./liveApi";
import * as mock from "./lawyerApi.mock";
import type { ClientView, JournalView, PolicyEdit, RequestDetail, RequestStatus, RequestSummary } from "./lawyerApi.types";
import { LawyerApiError } from "./lawyerApi.types";
import { loginLawyer, registerLawyer } from "./passkey";
export * from "./lawyerApi.types";

const MODE = process.env.NEXT_PUBLIC_LAWYER_MODE ?? "mock";
/** True while everything runs on the in-memory mock. Screens use it to show the "Simulated" note. */
export const IS_MOCK = MODE === "mock";

function impl(): typeof mock {
  if (MODE === "mock") return mock;
  if (MODE === "live") return live as unknown as typeof mock; // same function names and types as the mock
  throw new LawyerApiError("NOT_IMPLEMENTED", "Unknown NEXT_PUBLIC_LAWYER_MODE.");
}

export function inspectInvitation(token: string): Promise<{ valid: boolean; clientDisplayName: string; expiresAt: string }> {
  return impl().inspectInvitation(token);
}
export function acceptInvitation(token: string, i: { displayName: string; firm: string; consent?: { termsVersion: string } }): Promise<void> {
  // Creates the passkey. Live mode uses the real WebAuthn ceremony (lib/passkey.ts).
  return MODE === "live" ? registerLawyer(token, i) : impl().acceptInvitation(token, i);
}
export function login(): Promise<void> {
  return MODE === "live" ? loginLawyer() : impl().login();
}
export function getMe(): Promise<{ displayName: string; clients: number; pendingRequests: number; consent?: { termsVersion: string; acceptedAt: string } }> {
  return impl().getMe();
}
export function getClients(): Promise<ClientView[]> {
  return impl().getClients();
}
export function getRequests(status?: "pending" | "approved" | "refused" | "expired"): Promise<RequestSummary[]> {
  return impl().getRequests(status as RequestStatus | undefined);
}
export function getRequest(id: string): Promise<RequestDetail> {
  return impl().getRequest(id);
}
export function decide(id: string, decision: "approve" | "refuse", opts?: { addRecipient?: boolean }): Promise<void> {
  return impl().decide(id, decision, opts); // passkey assertion inside
}
export function getPolicy(clientId: string): Promise<PolicyEdit> {
  return impl().getPolicy(clientId);
}
export function updatePolicy(clientId: string, p: PolicyEdit): Promise<void> {
  return impl().updatePolicy(clientId, p); // passkey assertion inside
}
export function getJournal(limit?: number): Promise<JournalView> {
  return impl().getJournal(limit);
}
export function verifyAudit(): Promise<{ ok: boolean; checkedEntries: number; firstFailure?: string }> {
  return impl().verifyAudit();
}
