// Password hashing for the simulated Swissquote login: scrypt from node:crypto (CDC 0.4), random salt, constant-time check.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, KEY_LENGTH).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(scryptSync(password, Buffer.from(saltHex, "hex"), KEY_LENGTH), expected);
}
