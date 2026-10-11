// Recovery identity checks (CDC 6.2 and annex A.3). The identity check itself is simulated: its result is the console
// setting of the client AND a correct answer to the demo banking question. The safety delay is real:
// release_after = identity_verified_at + RECOVERY_DELAY_SECONDS, and the P3 node will check it on its own before signing.
import { createHash, timingSafeEqual } from "node:crypto";
import { appendAudit } from "./audit";
import { ApiError } from "./errors";
import { clientBySqRef, text, type Deps, type Input } from "./services";
import type { IdentityCheck } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

function recoveryId(input: Input): string {
  const id = text(input, "recoveryId");
  if (!UUID.test(id)) throw new ApiError(400, "INVALID_INPUT", "Field recoveryId is not a UUID.");
  return id.toLowerCase();
}
async function load({ store }: Deps, input: Input): Promise<IdentityCheck> {
  const check = await store.getIdentityCheck(recoveryId(input));
  if (!check) throw new ApiError(404, "UNKNOWN_RECOVERY", "Unknown recovery.");
  return check;
}

export async function identityStart(deps: Deps, input: Input) {
  const { store, now } = deps;
  const client = await clientBySqRef(store, input);
  const id = recoveryId(input);
  const oldAddress = (await store.getLatestLink(client.clientId))?.address ?? null;
  const created = await store.createIdentityCheck({
    recoveryId: id, clientId: client.clientId, outcome: null, identityVerifiedAt: null, releaseAfter: null,
    cancelledAt: null, usedAt: null, oldAddress, createdAt: now.toISOString(),
  });
  if (!created) throw new ApiError(409, "RECOVERY_EXISTS", "This recovery already has an identity check.");
  await appendAudit(store, "IDENTITY_CHECK_STARTED", { recoveryId: id, clientId: client.clientId }, now);
  return { status: "pending", simulated: true };
}

export async function identityVerify(deps: Deps, input: Input) {
  const { store, config, now } = deps;
  const check = await load(deps, input);
  // The selfie is accepted and discarded (simulated biometric check): it is never stored or logged.
  const answer = text(input, "bankingAnswer");
  if (check.cancelledAt) throw new ApiError(409, "RECOVERY_CANCELLED", "This recovery was cancelled.");
  if (check.outcome !== null) throw new ApiError(409, "IDENTITY_ALREADY_CHECKED", "The identity check of this recovery is already done.");

  const client = await store.getClient(check.clientId);
  const answerOk = config.bankingAnswer !== undefined && timingSafeEqual(sha256(answer), sha256(config.bankingAnswer));
  const verified = client?.identityOutcome === "pass" && answerOk;
  const releaseAfter = verified ? new Date(now.getTime() + config.recoveryDelaySeconds * 1000).toISOString() : null;
  await store.updateIdentityCheck(check.recoveryId, {
    outcome: verified ? "pass" : "fail", identityVerifiedAt: verified ? now.toISOString() : null, releaseAfter,
  });
  await appendAudit(store, verified ? "IDENTITY_CHECK_PASSED" : "IDENTITY_CHECK_FAILED", { recoveryId: check.recoveryId, clientId: check.clientId, releaseAfter, simulated: true }, now);
  return { verified, releaseAfter, simulated: true };
}

export async function recoveryCancel(deps: Deps, input: Input) {
  const { store, now } = deps;
  const check = await load(deps, input);
  if (check.usedAt) throw new ApiError(409, "RECOVERY_ALREADY_USED", "This recovery was already executed.");
  if (!check.cancelledAt) {
    await store.updateIdentityCheck(check.recoveryId, { cancelledAt: now.toISOString() });
    await appendAudit(store, "RECOVERY_CANCELLED", { recoveryId: check.recoveryId, clientId: check.clientId }, now);
  }
  return { cancelled: true };
}

export async function recoveryStatus(deps: Deps, input: Input) {
  const check = await load(deps, input);
  const base = {
    identityVerified: check.outcome === "pass",
    identityFailed: check.outcome === "fail",
    releaseAfter: check.releaseAfter,
    cancelled: check.cancelledAt !== null,
  };
  if (!check.safeAddress) return base;
  // Wallet (Safe) recovery: also tell the client where the recovery stands, so its screens poll the real state.
  const blocked = releaseBlock(check, deps.now);
  return {
    ...base,
    safeAddress: check.safeAddress,
    newOwnerAddress: check.newOwnerAddress ?? null,
    delayElapsed: check.releaseAfter !== null && deps.now.getTime() >= Date.parse(check.releaseAfter),
    releaseBlockedBy: blocked,
    p3Signed: check.p3SignedAt != null,
    executed: check.usedAt !== null,
    now: deps.now.toISOString(),
  };
}

export type ReleaseBlock = "IDENTITY_NOT_VERIFIED" | "RECOVERY_CANCELLED" | "RECOVERY_ALREADY_USED" | "DELAY_NOT_ELAPSED";

/** What the P3 node checks before it takes part in a recovery signature (CDC 6.2 step 6, annex A.3 /node/sign/open). */
export function releaseBlock(check: IdentityCheck, now: Date): ReleaseBlock | null {
  if (check.outcome !== "pass" || !check.identityVerifiedAt || !check.releaseAfter) return "IDENTITY_NOT_VERIFIED";
  if (check.cancelledAt) return "RECOVERY_CANCELLED";
  if (check.usedAt) return "RECOVERY_ALREADY_USED";
  if (now.getTime() < Date.parse(check.releaseAfter)) return "DELAY_NOT_ELAPSED";
  return null;
}
