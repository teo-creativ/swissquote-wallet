// MPC node core: encryption at rest for key shares and session state. Source of truth: /shared.
// AES-256-GCM from node:crypto. Keys are passed in by the caller (from env), never defined or logged here.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { MpcError } from "./types";

const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const PACK_FORMAT = 1;

/** Encryption keys by version. New records use `current`; old versions stay readable for rotation. */
export type KeyRing = { current: number; keys: Record<number, Uint8Array> };

/** One encrypted record. `ciphertext` ends with the 16-byte GCM tag. Maps to the columns keyshare_enc / nonce / key_version (CDC annex B). */
export type Sealed = { keyVersion: number; nonce: Uint8Array; ciphertext: Uint8Array };

function keyFor(ring: KeyRing, version: number): Uint8Array {
  const key = ring?.keys?.[version];
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw new MpcError("STORAGE_ERROR", "Storage error", { detail: `no 32-byte key for version ${version}` });
  return key;
}

/** Builds a key ring with a single key. `version` must be a small non-negative integer. */
export function singleKeyRing(version: number, key: Uint8Array): KeyRing {
  if (!Number.isInteger(version) || version < 0 || version > 0xffffffff) throw new Error("Invalid key version");
  if (!(key instanceof Uint8Array) || key.length !== KEY_BYTES) throw new Error("The encryption key must be 32 bytes");
  return { current: version, keys: { [version]: key } };
}

/**
 * Encrypts with the current key and a fresh random nonce. `context` is authenticated but not
 * encrypted: a record can only be opened with the same context (session id, round, party).
 */
export function seal(ring: KeyRing, plaintext: Uint8Array, context: string): Sealed {
  const key = keyFor(ring, ring.current);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const body = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return { keyVersion: ring.current, nonce: new Uint8Array(nonce), ciphertext: new Uint8Array(body) };
}

/** Decrypts and authenticates. Any failure (wrong key, wrong context, modified bytes) is a STORAGE_ERROR. */
export function open(ring: KeyRing, sealed: Sealed, context: string): Uint8Array {
  const key = keyFor(ring, sealed.keyVersion);
  if (sealed.nonce.length !== NONCE_BYTES || sealed.ciphertext.length < TAG_BYTES) throw new MpcError("STORAGE_ERROR", "Storage error", { detail: "malformed record" });
  try {
    const split = sealed.ciphertext.length - TAG_BYTES;
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.nonce);
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(sealed.ciphertext.subarray(split));
    return new Uint8Array(Buffer.concat([decipher.update(sealed.ciphertext.subarray(0, split)), decipher.final()]));
  } catch {
    throw new MpcError("STORAGE_ERROR", "Storage error", { detail: "record failed authentication" });
  }
}

/** Single byte string for stores with one column: format (1) | key version (4, big endian) | nonce (12) | ciphertext and tag. */
export function pack(sealed: Sealed): Uint8Array {
  const out = new Uint8Array(5 + NONCE_BYTES + sealed.ciphertext.length);
  out[0] = PACK_FORMAT;
  new DataView(out.buffer).setUint32(1, sealed.keyVersion);
  out.set(sealed.nonce, 5);
  out.set(sealed.ciphertext, 5 + NONCE_BYTES);
  return out;
}

export function unpack(bytes: Uint8Array): Sealed {
  if (!(bytes instanceof Uint8Array) || bytes.length < 5 + NONCE_BYTES + TAG_BYTES || bytes[0] !== PACK_FORMAT) throw new MpcError("STORAGE_ERROR", "Storage error", { detail: "malformed record" });
  const keyVersion = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1);
  return { keyVersion, nonce: bytes.slice(5, 5 + NONCE_BYTES), ciphertext: bytes.slice(5 + NONCE_BYTES) };
}
