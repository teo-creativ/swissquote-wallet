// Small shared helpers of the lawyer node.
import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { isAddress, type Address } from "viem";
import { ApiError } from "./errors";

export const invalid = (message: string) => new ApiError(400, "INVALID_INPUT", message);
export const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
/** SHA-256 hex of the canonical JSON (RFC 8785) of an intent: what the lawyer approves is exactly this value (CDC 5.4). */
export const intentHashOf = (intent: unknown) => sha256Hex(canonicalize(intent) ?? "");

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Input = Record<string, unknown>;

export function text(input: Input, key: string, max = 200): string {
  const v = input[key];
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw invalid(`Field ${key} is missing or invalid.`);
  return v;
}
export function uuid(input: Input, key: string): string {
  const v = text(input, key, 36);
  if (!UUID.test(v)) throw invalid(`Field ${key} is not a UUID.`);
  return v.toLowerCase();
}
export function addressOf(input: Input, key: string): Address {
  const v = text(input, key, 42);
  if (!isAddress(v, { strict: false })) throw invalid(`Field ${key} is not a valid address.`);
  return v as Address;
}
/** Decimal integer string in base units (USDC has 6 decimals). */
export function baseUnits(input: Input, key: string): bigint {
  const v = text(input, key, 40);
  if (!/^\d+$/.test(v)) throw invalid(`Field ${key} must be an integer string in base units.`);
  return BigInt(v);
}

/** Numeric columns come back as numbers from PostgREST and as strings from memory: read both as bigint. */
export const big = (v: unknown): bigint => (typeof v === "bigint" ? v : typeof v === "string" ? BigInt(v.split(".")[0]) : BigInt(Math.trunc(Number(v ?? 0))));

/** 5000000n -> "5.00", 5000001n -> "5.000001" (at least two decimals, at most six). */
export function formatUsdc(base: bigint): string {
  const neg = base < 0n;
  const v = neg ? -base : base;
  const int = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${neg ? "-" : ""}${int}.${frac}`;
}
/** "5" or "5.5" -> base units. Throws on anything that is not a USDC amount. */
export function parseUsdc(value: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!m) throw invalid("Amount must be in USDC with at most 6 decimals.");
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? "").padEnd(6, "0"));
}

const locks = new Map<string, Promise<unknown>>();
/** Runs jobs for the same key one after the other (policy evaluation reserves the daily budget, CDC 8.5 T10). Per server instance. */
export function withLock<T>(key: string, job: () => Promise<T>): Promise<T> {
  const run = (locks.get(key) ?? Promise.resolve()).then(job, job);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}
