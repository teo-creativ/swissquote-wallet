// Recovery of a Safe 2-of-3 (same address, funds stay put): the client's key P1 is replaced by a new key P1' with a Safe
// swapOwner transaction signed by P2 (lawyer) and P3 (this node). P3 signs ONLY when all three conditions hold, each checked here:
//   1. the identity check passed, 2. the safety delay elapsed (and the recovery was not cancelled), 3. the lawyer approved,
// proven by P2's own signature over the exact swapOwner hash that this node rebuilt from the chain.
import { getAddress, isHex, recoverAddress, type Address, type Hex } from "viem";
import { safeTxHash, swapOwnerTx } from "../src/shared/safe";
import { appendAudit } from "./audit";
import { ApiError } from "./errors";
import { signHashAsOwner } from "./owner";
import { releaseBlock, type ReleaseBlock } from "./recovery";
import { address, clientBySqRef, text, type Deps, type Input } from "./services";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const invalid = (message: string) => new ApiError(400, "INVALID_INPUT", message);

function recoveryIdOf(input: Input): string {
  const id = text(input, "recoveryId");
  if (!UUID.test(id)) throw invalid("Field recoveryId is not a UUID.");
  return id.toLowerCase();
}

/**
 * POST /api/recovery/open {sqRef, recoveryId, safeAddress, newOwnerAddress?}: starts the identity check of a Safe recovery.
 * The new key is created on the new phone after the identity check, so it may be attached later (recovery/attach).
 */
export async function recoveryOpen(deps: Deps, input: Input) {
  const { store, chain, now } = deps;
  const client = await clientBySqRef(store, input);
  const recoveryId = recoveryIdOf(input);
  const safe = getAddress(address(input, "safeAddress"));
  const newOwner = input.newOwnerAddress === undefined ? null : getAddress(address(input, "newOwnerAddress"));
  const account = await store.getSafeAccount(client.sqRef);
  if (!account || account.safeAddress !== safe.toLowerCase()) throw new ApiError(404, "UNKNOWN_SAFE", "This wallet does not belong to this client.");
  const state = await chain.getSafeState(safe);
  if (newOwner && state.owners.some((o) => o.toLowerCase() === newOwner.toLowerCase())) throw new ApiError(409, "ALREADY_OWNER", "This key already controls the wallet.");

  const created = await store.createIdentityCheck({
    recoveryId, clientId: client.clientId, outcome: null, identityVerifiedAt: null, releaseAfter: null, cancelledAt: null, usedAt: null,
    oldAddress: safe.toLowerCase(), createdAt: now.toISOString(), safeAddress: safe.toLowerCase(), newOwnerAddress: newOwner?.toLowerCase() ?? null,
  });
  if (!created) throw new ApiError(409, "RECOVERY_EXISTS", "This recovery already exists.");
  await appendAudit(store, "RECOVERY_OPENED", { recoveryId, clientId: client.clientId, safe: safe.toLowerCase(), newOwner: newOwner?.toLowerCase() ?? null }, now);
  return { status: "pending", simulated: true };
}

/** POST /api/recovery/attach {recoveryId, newOwnerAddress}: the new phone's key, once. Refused after the key was set or the recovery closed. */
export async function recoveryAttach(deps: Deps, input: Input) {
  const { store, chain, now } = deps;
  const recoveryId = recoveryIdOf(input);
  const newOwner = getAddress(address(input, "newOwnerAddress"));
  const check = await store.getIdentityCheck(recoveryId);
  if (!check || !check.safeAddress) throw new ApiError(404, "UNKNOWN_RECOVERY", "Unknown recovery.");
  if (check.cancelledAt || check.usedAt) throw new ApiError(409, "RECOVERY_CLOSED", "This recovery is closed.");
  if (check.newOwnerAddress) {
    if (check.newOwnerAddress === newOwner.toLowerCase()) return { attached: true };
    throw new ApiError(409, "NEW_OWNER_SET", "The new key of this recovery is already set.");
  }
  const state = await chain.getSafeState(getAddress(check.safeAddress));
  if (state.owners.some((o) => o.toLowerCase() === newOwner.toLowerCase())) throw new ApiError(409, "ALREADY_OWNER", "This key already controls the wallet.");
  await store.updateIdentityCheck(recoveryId, { newOwnerAddress: newOwner.toLowerCase() });
  await appendAudit(store, "RECOVERY_KEY_ATTACHED", { recoveryId, clientId: check.clientId, newOwner: newOwner.toLowerCase() }, now);
  return { attached: true };
}

/** The client key is the one owner that is neither P2 nor P3. Read from the chain, so a second recovery works too. */
function currentClientOwner(owners: readonly Address[], p2: string, p3: string): Address {
  const rest = owners.filter((o) => o.toLowerCase() !== p2 && o.toLowerCase() !== p3);
  if (rest.length !== 1) throw new ApiError(409, "UNEXPECTED_OWNERS", "The wallet owners are not in the expected state.");
  return rest[0];
}

function blockedMessage(code: ReleaseBlock): string {
  switch (code) {
    case "IDENTITY_NOT_VERIFIED": return "The identity check has not passed.";
    case "RECOVERY_CANCELLED": return "This recovery was cancelled.";
    case "RECOVERY_ALREADY_USED": return "This recovery was already executed.";
    case "DELAY_NOT_ELAPSED": return "The safety delay has not elapsed yet.";
  }
}

/** POST /api/node/sign {recoveryId, safeTxHash, p2Signature}. Resolves the P3 signature, or an error naming the unmet condition. */
export async function nodeSign(deps: Deps, input: Input) {
  const { store, chain, now } = deps;
  const recoveryId = recoveryIdOf(input);
  const check = await store.getIdentityCheck(recoveryId);
  if (!check) throw new ApiError(404, "UNKNOWN_RECOVERY", "Unknown recovery.");
  if (!check.safeAddress || !check.newOwnerAddress) throw new ApiError(409, "NOT_A_WALLET_RECOVERY", "This recovery is not a wallet recovery.");

  const blocked = releaseBlock(check, now);
  if (blocked) throw new ApiError(403, blocked, blockedMessage(blocked));

  const client = await store.getClient(check.clientId);
  const account = client ? await store.getSafeAccount(client.sqRef) : null;
  if (!client || !account || account.safeAddress !== check.safeAddress) throw new ApiError(404, "UNKNOWN_SAFE", "Unknown wallet.");

  const claimed = text(input, "safeTxHash", 66);
  const p2Signature = text(input, "p2Signature", 132);
  if (!isHex(claimed) || claimed.length !== 66) throw invalid("Field safeTxHash is not a 32 byte hash.");
  if (!isHex(p2Signature) || p2Signature.length !== 132) throw invalid("Field p2Signature is not a 65 byte signature.");

  // This node builds the transaction itself from the chain state. It never signs a hash it did not build.
  const safe = getAddress(check.safeAddress);
  const state = await chain.getSafeState(safe);
  if (state.owners.some((o) => o.toLowerCase() === check.newOwnerAddress)) throw new ApiError(409, "RECOVERY_ALREADY_APPLIED", "The new key already controls the wallet.");
  const tx = swapOwnerTx({
    safe, owners: state.owners, oldOwner: currentClientOwner(state.owners, account.p2Address, account.p3Address), newOwner: getAddress(check.newOwnerAddress),
  });
  const hash = safeTxHash({ safe, tx, nonce: state.nonce });
  if (hash.toLowerCase() !== claimed.toLowerCase()) throw new ApiError(409, "HASH_MISMATCH", "The transaction hash does not match the recovery.");

  // Condition 3: the lawyer approved. Proof = P2's signature over this exact hash.
  const signer = await recoverAddress({ hash, signature: p2Signature as Hex }).catch(() => null);
  if (!signer || signer.toLowerCase() !== account.p2Address) throw new ApiError(403, "LAWYER_APPROVAL_REQUIRED", "The lawyer has not approved this recovery.");

  const { signature, signer: p3 } = await signHashAsOwner(deps, client.sqRef, hash);
  await store.updateIdentityCheck(recoveryId, { safeTxHash: hash, p3SignedAt: now.toISOString() });
  await appendAudit(store, "RECOVERY_P3_SIGNED", { recoveryId, clientId: client.clientId, safe: account.safeAddress, safeTxHash: hash }, now);
  return { signature, signer: p3, safeTxHash: hash };
}

/** POST /api/recovery/executed {recoveryId, txHash}: closes the recovery once the chain shows the new owner. */
export async function recoveryExecuted(deps: Deps, input: Input) {
  const { store, chain, now, sleep } = deps;
  const recoveryId = recoveryIdOf(input);
  const txHash = text(input, "txHash", 66);
  if (!isHex(txHash) || txHash.length !== 66) throw invalid("Field txHash is not a transaction hash.");
  const check = await store.getIdentityCheck(recoveryId);
  if (!check || !check.safeAddress || !check.newOwnerAddress) throw new ApiError(404, "UNKNOWN_RECOVERY", "Unknown recovery.");
  if (check.usedAt) return { done: true };
  if (!check.p3SignedAt) throw new ApiError(409, "NOT_SIGNED", "This recovery was not signed by Swissquote.");

  let applied = false;
  for (let i = 0; i < 4 && !applied; i++) {
    if (i > 0) await sleep(1500);
    const state = await chain.getSafeState(getAddress(check.safeAddress));
    applied = state.owners.some((o) => o.toLowerCase() === check.newOwnerAddress);
  }
  if (!applied) throw new ApiError(409, "NOT_EXECUTED_YET", "The new key does not control the wallet yet.");
  await store.updateIdentityCheck(recoveryId, { usedAt: now.toISOString(), executedTxHash: txHash });
  await appendAudit(store, "RECOVERY_EXECUTED", { recoveryId, clientId: check.clientId, safe: check.safeAddress, txHash }, now);
  return { done: true };
}
