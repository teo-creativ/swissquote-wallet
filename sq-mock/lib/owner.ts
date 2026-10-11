// P3 owner key of the Safe 2-of-3 (Swissquote node). The private key is generated here, stored only encrypted with
// SQ_SHARE_ENC_KEY (AES-256-GCM, bound to the account by the additional authenticated data) and never returned or logged.
// The only thing that leaves this module is a public address or a signature over a hash this node built itself.
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { appendAudit } from "./audit";
import { ApiError } from "./errors";
import { clientBySqRef, type Deps, type Input } from "./services";
import { openSecret, parseEncKey, sealSecret } from "../src/shared/share-crypto";

const GENERATION = 1;
const aad = (sqRef: string, generation: number) => `sqkeys-owner|P3|${sqRef.toLowerCase()}|${generation}`;

function encKey(deps: Deps): Buffer {
  try {
    return parseEncKey((deps.env ?? process.env).SQ_SHARE_ENC_KEY);
  } catch {
    throw new ApiError(500, "NOT_CONFIGURED", "The owner key encryption is not configured.");
  }
}
const keyVersion = (deps: Deps) => {
  const n = Number((deps.env ?? process.env).SQ_SHARE_ENC_KEY_VERSION);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/** POST /api/node/owner/create {sqRef}. Idempotent: the same account always gets the same P3 address. */
export async function ownerCreate(deps: Deps, input: Input): Promise<{ address: Address }> {
  const { store, now } = deps;
  const client = await clientBySqRef(store, input);
  const existing = await store.getOwnerShare(client.sqRef);
  if (existing) return { address: getAddress(existing.address) };

  const key = encKey(deps);
  const privateKey = generatePrivateKey();
  const owner = privateKeyToAccount(privateKey);
  const { ciphertext, nonce } = sealSecret(key, Buffer.from(privateKey.slice(2), "hex"), aad(client.sqRef, GENERATION));
  const created = await store.insertOwnerShareIfAbsent({
    sqRef: client.sqRef, generation: GENERATION, address: owner.address.toLowerCase(), keyshareEnc: ciphertext.toString("hex"),
    nonce: nonce.toString("hex"), keyVersion: keyVersion(deps), createdAt: now.toISOString(),
  });
  if (!created) {
    // Lost a race with a parallel request: return the winner.
    const winner = await store.getOwnerShare(client.sqRef);
    if (!winner) throw new ApiError(500, "INTERNAL", "Internal error.");
    return { address: getAddress(winner.address) };
  }
  await appendAudit(store, "OWNER_CREATED", { sqRef: client.sqRef, party: "P3", address: owner.address.toLowerCase() }, now);
  return { address: owner.address };
}

/** Signs a 32 byte hash with the P3 key of the account. Callers must have built the hash themselves and checked the conditions. */
export async function signHashAsOwner(deps: Deps, sqRef: string, hash: Hex): Promise<{ signature: Hex; signer: Address }> {
  const share = await deps.store.getOwnerShare(sqRef);
  if (!share) throw new ApiError(404, "NO_OWNER_KEY", "No owner key exists for this account.");
  let raw: Buffer;
  try {
    raw = openSecret(encKey(deps), Buffer.from(share.keyshareEnc, "hex"), Buffer.from(share.nonce, "hex"), aad(sqRef, share.generation));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(500, "OWNER_KEY_UNREADABLE", "The owner key could not be read.");
  }
  try {
    const owner = privateKeyToAccount(`0x${raw.toString("hex")}`);
    return { signature: await owner.sign({ hash }), signer: owner.address };
  } finally {
    raw.fill(0);
  }
}
