import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openSecret, parseEncKey, sealSecret } from "./share-crypto";

const key = randomBytes(32);
const secret = randomBytes(32);

describe("share-crypto", () => {
  it("round-trips and never stores the plaintext", () => {
    const { ciphertext, nonce } = sealSecret(key, secret, "sqkeys-owner|P3|a|1");
    expect(ciphertext.includes(secret)).toBe(false);
    expect(openSecret(key, ciphertext, nonce, "sqkeys-owner|P3|a|1").equals(secret)).toBe(true);
  });
  it("uses a fresh nonce each time", () => {
    expect(sealSecret(key, secret, "x").nonce.equals(sealSecret(key, secret, "x").nonce)).toBe(false);
  });
  it("refuses another owner's aad, another key, a flipped bit", () => {
    const { ciphertext, nonce } = sealSecret(key, secret, "sqkeys-owner|P3|a|1");
    expect(() => openSecret(key, ciphertext, nonce, "sqkeys-owner|P3|b|1")).toThrow();
    expect(() => openSecret(randomBytes(32), ciphertext, nonce, "sqkeys-owner|P3|a|1")).toThrow();
    const bad = Buffer.from(ciphertext);
    bad[0] ^= 1;
    expect(() => openSecret(key, bad, nonce, "sqkeys-owner|P3|a|1")).toThrow();
  });
  it("parses hex and base64 keys, rejects the rest without echoing them", () => {
    expect(parseEncKey(key.toString("hex")).equals(key)).toBe(true);
    expect(parseEncKey(key.toString("base64")).equals(key)).toBe(true);
    expect(() => parseEncKey(undefined)).toThrow("not configured");
    expect(() => parseEncKey("short-secret-value")).toThrow(/32 bytes/);
    try { parseEncKey("short-secret-value"); } catch (e) { expect(String(e)).not.toContain("short-secret-value"); }
  });
});
