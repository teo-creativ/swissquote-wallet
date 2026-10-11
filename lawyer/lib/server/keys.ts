// P2 owner key of the Safe 2-of-3 (lawyer node). Generated here, stored only encrypted (AES-256-GCM, LAWYER_SHARE_ENC_KEY, bound to the
// client by the additional authenticated data) in the shares table. Never returned or logged: only an address or a signature leaves.
import { getAddress, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { openSecret, parseEncKey, sealSecret } from "@/src/shared/share-crypto";
import { PARTY } from "@/src/shared/constants";
import type { Ctx } from "./ctx";
import { DbError } from "./db";
import { ApiError } from "./errors";

const GENERATION = 1;
const aad = (clientId: string, generation: number) => `sqkeys-owner|P2|${clientId.toLowerCase()}|${generation}`;

function encKey(ctx: Ctx): Buffer {
  try {
    return parseEncKey(ctx.env.LAWYER_SHARE_ENC_KEY);
  } catch {
    throw new ApiError(500, "NOT_CONFIGURED", "The owner key encryption is not configured.");
  }
}

export async function ownerAddress(ctx: Ctx, clientId: string): Promise<Address | null> {
  const row = (await ctx.db.select("shares", { client_id: clientId, status: "active" }, { order: ["generation", "desc"], limit: 1 }))[0];
  return row ? getAddress(row.address) : null;
}

/** Idempotent: the same client always gets the same P2 address. */
export async function ownerCreate(ctx: Ctx, clientId: string): Promise<Address> {
  const existing = await ownerAddress(ctx, clientId);
  if (existing) return existing;
  const key = encKey(ctx);
  const privateKey = generatePrivateKey();
  const owner = privateKeyToAccount(privateKey);
  const { ciphertext, nonce } = sealSecret(key, Buffer.from(privateKey.slice(2), "hex"), aad(clientId, GENERATION));
  const keyVersion = Number(ctx.env.LAWYER_SHARE_ENC_KEY_VERSION);
  try {
    await ctx.db.insert("shares", {
      client_id: clientId, generation: GENERATION, party_id: PARTY.LAWYER, public_key: owner.address, address: owner.address.toLowerCase(),
      keyshare_enc: ciphertext.toString("hex"), nonce: nonce.toString("hex"), key_version: Number.isInteger(keyVersion) && keyVersion > 0 ? keyVersion : 1,
      status: "active", created_at: ctx.now.toISOString(),
    });
  } catch (e) {
    if (e instanceof DbError && e.kind === "UNIQUE") return (await ownerAddress(ctx, clientId))!; // lost a race: return the winner
    throw e;
  }
  return owner.address;
}

/** Signs a 32 byte hash with the P2 key. Callers must have built the hash themselves and checked every condition. */
export async function signHashAsOwner(ctx: Ctx, clientId: string, hash: Hex): Promise<{ signature: Hex; signer: Address }> {
  const share = (await ctx.db.select("shares", { client_id: clientId, status: "active" }, { order: ["generation", "desc"], limit: 1 }))[0];
  if (!share) throw new ApiError(404, "NO_OWNER_KEY", "No owner key exists for this client.");
  let raw: Buffer;
  try {
    raw = openSecret(encKey(ctx), Buffer.from(share.keyshare_enc, "hex"), Buffer.from(share.nonce, "hex"), aad(clientId, share.generation));
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
