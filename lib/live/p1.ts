// P1: the client's Safe owner key. Generated in this browser, kept ONLY wrapped (AES-256-GCM) in IndexedDB. The wrapping key comes from
// the passkey: HKDF-SHA256 of the PRF output (normal protection) or a non-extractable key gated by a user-verification assertion
// (reduced protection, shown as such). P1 never leaves the browser: only signatures are sent to the server.
//
// iOS rule: the passkey prompt (navigator.credentials.get) must start inside the tap handler. That is why the key id and the protection
// level are mirrored in localStorage (readable synchronously) and unlockP1() calls the passkey first, before any await.
import { bytesToHex, hexToBytes, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { SqKeysError } from "@/lib/sqkeys.types";
import { PasskeyError, b64uDecode, b64uEncode, deriveWrappingKey, getPasskey, getProtectionLevel, randomBytes, sameBytes, unlockFallbackKey, type ProtectionLevel } from "@/lib/passkey/webauthn";

export type Slot = "current" | "pending";
export type P1Meta = { credentialId: string; address: string; level: ProtectionLevel; createdAt: string };

const DB = "sqkeys-p1";
const OBJ = "wrapped";
const META = (slot: Slot) => `sqkeys.p1.${slot}`;
const fallbackSlot = (slot: Slot) => (slot === "current" ? "p1-wrap" : "p1-wrap-pending");
const aad = (address: string, credentialId: string) => new TextEncoder().encode(`sqkeys-p1|${address.toLowerCase()}|${credentialId}`);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OBJ);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(slot: Slot, value: { iv: Uint8Array; ct: ArrayBuffer }): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OBJ, "readwrite");
    tx.objectStore(OBJ).put(value, slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function idbGet(slot: Slot): Promise<{ iv: Uint8Array; ct: ArrayBuffer } | undefined> {
  const db = await openDb();
  const v = await new Promise<{ iv: Uint8Array; ct: ArrayBuffer } | undefined>((resolve, reject) => {
    const req = db.transaction(OBJ, "readonly").objectStore(OBJ).get(slot);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return v;
}
async function idbDelete(slot: Slot): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OBJ, "readwrite");
    tx.objectStore(OBJ).delete(slot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function readMeta(slot: Slot = "current"): P1Meta | null {
  try {
    const raw = localStorage.getItem(META(slot));
    return raw ? (JSON.parse(raw) as P1Meta) : null;
  } catch {
    return null;
  }
}
const writeMeta = (slot: Slot, meta: P1Meta) => localStorage.setItem(META(slot), JSON.stringify(meta));

/** Generates a new P1, wraps it with `wrappingKey` and stores it. Resolves the public address (the Safe owner). */
export async function sealNewP1(wrappingKey: CryptoKey, credentialId: Uint8Array, level: ProtectionLevel, slot: Slot = "current"): Promise<{ address: string }> {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const cred = b64uEncode(credentialId);
  const iv = randomBytes(12);
  const raw = Uint8Array.from(hexToBytes(privateKey));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(account.address, cred) }, wrappingKey, raw);
  raw.fill(0);
  await idbPut(slot, { iv, ct });
  writeMeta(slot, { credentialId: cred, address: account.address, level, createdAt: new Date().toISOString() });
  return { address: account.address };
}

export type UnlockedP1 = { address: string; signHash(hash: Hex): Promise<Hex>; exportKey(): Hex };

/**
 * Unlocks P1 with the passkey. NOT async on purpose: the passkey prompt starts before any await, as the iOS rule requires.
 * The key lives in memory only until the returned object is dropped.
 */
export function unlockP1(slot: Slot = "current"): Promise<UnlockedP1> {
  const meta = readMeta(slot);
  if (!meta) return Promise.reject(new SqKeysError("NO_KEY_ON_DEVICE", "This phone does not hold your key. Use Recovery to set up this phone."));
  const credential = b64uDecode(meta.credentialId);
  const wrapping: Promise<CryptoKey> =
    meta.level === "reduced"
      ? unlockFallbackKey(credential, fallbackSlot(slot))
      : getPasskey(credential, randomBytes(32), true).then((r) => {
          if (!r.prfOutput) throw new PasskeyError({ name: "PASSKEY_PRF_MISSING", message: "This phone did not unlock your key with the passkey.", help: "Try again, or use Recovery.", action: "retry" });
          if (!sameBytes(r.credentialId, credential)) throw new PasskeyError({ name: "WRONG_PASSKEY", message: "That is not the passkey of your SQ Keys key.", help: "Pick the SQ Keys passkey.", action: "retry" });
          return deriveWrappingKey(r.prfOutput as Uint8Array<ArrayBuffer>);
        });
  return wrapping.then(async (key) => {
    const stored = await idbGet(slot);
    if (!stored) throw new SqKeysError("NO_KEY_ON_DEVICE", "This phone does not hold your key. Use Recovery to set up this phone.");
    let plain: ArrayBuffer;
    try {
      plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: stored.iv as Uint8Array<ArrayBuffer>, additionalData: aad(meta.address, meta.credentialId) }, key, stored.ct);
    } catch {
      throw new SqKeysError("KEY_UNREADABLE", "Your key could not be unlocked on this phone.");
    }
    const bytes = new Uint8Array(plain);
    const hex = bytesToHex(bytes);
    bytes.fill(0);
    const account = privateKeyToAccount(hex);
    if (account.address.toLowerCase() !== meta.address.toLowerCase()) throw new SqKeysError("KEY_UNREADABLE", "Your key could not be unlocked on this phone.");
    return { address: account.address, signHash: (hash: Hex) => account.sign({ hash }), exportKey: () => hex };
  });
}

/** After a recovery succeeded the key of the new phone becomes the current one. */
export async function promotePending(): Promise<void> {
  const meta = readMeta("pending");
  const stored = await idbGet("pending");
  if (!meta || !stored) return;
  await idbPut("current", stored);
  writeMeta("current", meta);
  localStorage.removeItem(META("pending"));
  await idbDelete("pending");
}

export async function discardPending(): Promise<void> {
  localStorage.removeItem(META("pending"));
  await idbDelete("pending").catch(() => undefined);
}

export const fallbackSlotName = fallbackSlot;
export { getProtectionLevel };
