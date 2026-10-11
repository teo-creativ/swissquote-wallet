// The console in live mode: reads and writes the real state of sq-mock (Swissquote) through its console routes. The password is sent by
// THIS server only (header x-console-password, CONSOLE_PASSWORD), never by a browser. Server only.
import { createHash } from "node:crypto";
import { getAddress } from "viem";
import type { Recovery, ConsoleClient, ComplianceAlert, IdentityOutcome, OwnershipProof, SimulatedCall } from "./console.types";
import { DEMO_DELAY_SECONDS } from "./console.logic";

async function sq<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const base = process.env.SQ_URL;
  const password = process.env.CONSOLE_PASSWORD;
  if (!base || !password) throw new Error("The Swissquote service is not set up. Tell the SQ Keys team.");
  const res = await fetch(base.replace(/\/+$/, "") + path, {
    method, cache: "no-store", headers: { "content-type": "application/json", "x-console-password": password },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
  }).catch(() => {
    throw new Error("The Swissquote service did not answer. Try again.");
  });
  const data = (await res.json().catch(() => null)) as Record<string, any> | null;
  if (!res.ok) throw new Error(typeof data?.error?.message === "string" ? data.error.message : "The Swissquote service refused this request.");
  return data as T;
}

const ms = (v: string | null | undefined): number | null => (v ? Date.parse(v) : null);
const short = (h: string) => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

type SqCheck = {
  recoveryId: string; clientId: string; outcome: "pass" | "fail" | null; identityVerifiedAt: string | null; releaseAfter: string | null; cancelledAt: string | null;
  usedAt: string | null; createdAt: string; safeAddress?: string | null; safeTxHash?: string | null; p3SignedAt?: string | null;
};

function toRecovery(c: SqCheck): Recovery {
  const verifiedAt = ms(c.identityVerifiedAt);
  const releaseAfter = ms(c.releaseAfter);
  const createdAt = Date.parse(c.createdAt);
  const signedAt = ms(c.p3SignedAt);
  return {
    id: c.recoveryId, clientId: c.clientId, createdAt, identityRequestedAt: createdAt, identityOutcome: c.outcome,
    delaySeconds: verifiedAt !== null && releaseAfter !== null ? Math.round((releaseAfter - verifiedAt) / 1000) : DEMO_DELAY_SECONDS,
    cancelledAt: ms(c.cancelledAt), cosignedAt: signedAt, proofHash: c.safeTxHash ?? createHash("sha256").update(c.recoveryId).digest("hex"),
    real: {
      identity: c.outcome === "pass" ? "verified" : c.outcome === "fail" ? "failed" : "pending", identityVerifiedAt: verifiedAt,
      identityFailedAt: c.outcome === "fail" ? createdAt : null, lawyer: signedAt !== null ? "approved" : "pending", lawyerApprovedAt: signedAt, releaseAfter,
    },
  };
}

export async function listRecoveries(): Promise<Recovery[]> {
  return (await sq<{ recoveries: SqCheck[] }>("GET", "/api/console/recoveries")).recoveries.map(toRecovery).sort((a, b) => b.createdAt - a.createdAt);
}
export async function getRecovery(id: string): Promise<Recovery | null> {
  return (await listRecoveries()).find((r) => r.id === id) ?? null;
}
export async function sendIdentityCheck(): Promise<Recovery> {
  throw new Error("The client runs the identity check in the app. Set the next result with the switch.");
}
export async function cosignRelease(): Promise<Recovery> {
  throw new Error("Swissquote signs by itself once the identity check passed, the delay is over and the lawyer approved.");
}
export async function setNextIdentityOutcome(clientId: string, outcome: IdentityOutcome): Promise<ConsoleClient> {
  await sq("POST", "/api/console/identity-outcome", { clientId, outcome });
  const client = (await listClients()).find((c) => c.id === clientId);
  if (!client) throw new Error("Client not found.");
  return client;
}

export async function listClients(): Promise<ConsoleClient[]> {
  const [{ clients }, recoveries] = await Promise.all([
    sq<{ clients: { clientId: string; name: string; identityOutcome: IdentityOutcome; address: string | null; proofVerified: boolean }[] }>("GET", "/api/console/clients"),
    listRecoveries(),
  ]);
  return clients.map((c, i) => ({
    id: c.clientId, number: String(i + 1).padStart(4, "0"), displayName: c.name, address: c.address ?? "No wallet yet",
    status: recoveries.some((r) => r.clientId === c.clientId && r.cancelledAt === null && r.cosignedAt === null) ? ("recovery_requested" as const) : ("active" as const),
    proofVerified: c.proofVerified, nextIdentityOutcome: c.identityOutcome,
  }));
}

/** In Safe mode there is no ownership signature: the page lists the wallets Swissquote helped create, with their creation transaction. */
export async function listProofs(): Promise<OwnershipProof[]> {
  const { safes } = await sq<{ safes: { sqRef: string; safeAddress: string; owners: string[]; deployTxHash: string | null; createdAt: string }[] }>("GET", "/api/console/safes");
  const clients = await listClients();
  return safes
    .map((s) => ({
      id: s.sqRef, clientId: clients.find((c) => c.address.toLowerCase() === s.safeAddress.toLowerCase())?.id ?? s.sqRef, address: getAddress(s.safeAddress),
      message: `Safe 2-of-3 wallet created. Owners: ${s.owners.map(short).join(", ")}. Network fee paid by the sponsor.`,
      signature: s.deployTxHash ? short(s.deployTxHash) : "n/a", verified: true, at: Date.parse(s.createdAt),
    }))
    .sort((a, b) => b.at - a.at);
}

export async function listAlerts(): Promise<ComplianceAlert[]> {
  const [{ alerts }, recoveries] = await Promise.all([
    sq<{ alerts: { id: number; account: string | null; target: string | null; reason: string | null; createdAt: string }[] }>("GET", "/api/console/alerts"),
    listRecoveries(),
  ]);
  const out: ComplianceAlert[] = alerts.map((a) => ({
    id: `alert_${a.id}`, at: Date.parse(a.createdAt), severity: "critical" as const, kind: "sanctioned_transfer" as const, clientId: a.account ?? "unknown",
    message: a.reason ?? `Transfer to ${a.target ?? "an address"} refused.`,
  }));
  for (const r of recoveries) {
    out.push({ id: `alert_req_${r.id}`, at: r.createdAt, severity: "info", kind: "recovery_requested", clientId: r.clientId, message: "Recovery requested from a new device. The client's lawyer was alerted." });
    if (r.real?.identity === "failed") out.push({ id: `alert_fail_${r.id}`, at: r.real.identityFailedAt ?? r.createdAt, severity: "critical", kind: "identity_failed", clientId: r.clientId, message: "Identity check failed. Recovery blocked and the client's lawyer alerted." });
    if (r.cosignedAt !== null) out.push({ id: `alert_done_${r.id}`, at: r.cosignedAt, severity: "info", kind: "recovery_completed", clientId: r.clientId, message: "Swissquote signed the replacement of the client's phone key." });
  }
  return out.sort((a, b) => b.at - a.at);
}

export async function listCalls(): Promise<SimulatedCall[]> {
  const { calls } = await sq<{ calls: { id: number; clientId: string | null; reason: string | null; createdAt: string }[] }>("GET", "/api/console/calls");
  return calls
    .map((c) => ({ id: `call_${c.id}`, at: Date.parse(c.createdAt), clientId: c.clientId ?? "unknown", phone: "+41 ** *** ** **", reason: c.reason ?? "Call", result: "Answered" as const }))
    .sort((a, b) => b.at - a.at);
}
