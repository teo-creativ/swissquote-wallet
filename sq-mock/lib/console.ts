// Console routes (CDC annex A.3): read only, except the identity outcome switch used in the demo (CDC 6.3).
// Protected by CONSOLE_PASSWORD sent in the x-console-password header by the client app SERVER (never by a browser).
// Fails closed: without CONSOLE_PASSWORD nobody gets in.
import { createHash, timingSafeEqual } from "node:crypto";
import { getAddress } from "viem";
import { appendAudit } from "./audit";
import { ApiError, errorResponse } from "./errors";
import { getDeps, parseBody, readLimited } from "./http";
import { releaseBlock } from "./recovery";
import { text, type Deps, type Input } from "./services";

export const CONSOLE_HEADER = "x-console-password";
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

export function consolePasswordMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

export function consoleRoute(handler: (deps: Deps, input: Input) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    try {
      if (!consolePasswordMatches(req.headers.get(CONSOLE_HEADER), process.env.CONSOLE_PASSWORD))
        throw new ApiError(401, "UNAUTHENTICATED", "Console authentication failed.");
      const input = req.method === "GET" ? {} : parseBody(await readLimited(req));
      return Response.json(await handler(await getDeps(), input));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

const shorten = (hex: string) => (hex.length > 22 ? `${hex.slice(0, 10)}...${hex.slice(-8)}` : hex);

export async function consoleClients({ store }: Deps) {
  const links = await store.listLinks();
  const clients = (await store.listClients()).map((c) => {
    const latest = links.filter((l) => l.clientId === c.clientId).sort((a, b) => b.linkedAt.localeCompare(a.linkedAt))[0];
    // The password hash is deliberately left out.
    return {
      clientId: c.clientId, sqRef: c.sqRef, name: c.name, kycStatus: c.kycStatus, kycCheckedAt: c.kycCheckedAt, cashChf: c.cashChf,
      identityOutcome: c.identityOutcome, address: latest ? getAddress(latest.address) : null, proofVerified: Boolean(latest),
    };
  });
  return { clients, simulated: true };
}

export async function consoleProofs({ store }: Deps) {
  const proofs = (await store.listProofs()).map((p) => ({ ...p, address: getAddress(p.address), signature: shorten(p.signature) }));
  return { proofs };
}

export async function consoleRecoveries({ store, now }: Deps) {
  const recoveries = (await store.listIdentityChecks()).map((r) => ({
    ...r, oldAddress: r.oldAddress ? getAddress(r.oldAddress) : null, releaseBlockedBy: releaseBlock(r, now),
  }));
  return { recoveries, now: now.toISOString(), simulated: true };
}

export async function consoleAlerts({ store }: Deps) {
  return { alerts: await store.listComplianceAlerts(), simulated: true };
}

export async function consoleCalls({ store }: Deps) {
  return { calls: await store.listCalls(), simulated: true };
}

export async function consoleIdentityOutcome({ store, now }: Deps, input: Input) {
  const clientId = text(input, "clientId");
  const outcome = input.outcome;
  if (outcome !== "pass" && outcome !== "fail") throw new ApiError(400, "INVALID_INPUT", "Field outcome must be pass or fail.");
  if (!(await store.getClient(clientId))) throw new ApiError(404, "UNKNOWN_CLIENT", "Unknown client.");
  await store.updateClient(clientId, { identityOutcome: outcome });
  await appendAudit(store, "IDENTITY_OUTCOME_SET", { clientId, outcome, simulated: true }, now);
  return { clientId, outcome, simulated: true };
}
