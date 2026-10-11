import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import { packSignatures, prevOwnerOf, safeInitializer, safeTxHash, saltNonceFor, swapOwnerTx, usdcTransferTx, SAFE_SENTINEL } from "./safe";

const addr = () => privateKeyToAccount(generatePrivateKey()).address;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const SAFE = "0xa14072e78D994dB07a6098927020eDD4237BAE90";

describe("safe helpers", () => {
  it("salt nonce is deterministic per account and differs between accounts", () => {
    expect(saltNonceFor("AAAA")).toBe(saltNonceFor("aaaa"));
    expect(saltNonceFor("a")).not.toBe(saltNonceFor("b"));
  });
  it("needs three distinct owners", () => {
    const a = addr();
    expect(() => safeInitializer([a, a, addr()])).toThrow("distinct");
    expect(() => safeInitializer([a, addr()])).toThrow("three");
  });
  it("safeTxHash depends on every field (and matches Safe.getTransactionHash, see spike/verify-shared.ts)", () => {
    const tx = usdcTransferTx(USDC, addr(), 1_000_000n);
    const base = safeTxHash({ safe: SAFE, tx, nonce: 0n });
    expect(base).toMatch(/^0x[0-9a-f]{64}$/);
    expect(safeTxHash({ safe: SAFE, tx, nonce: 1n })).not.toBe(base);
    expect(safeTxHash({ safe: addr(), tx, nonce: 0n })).not.toBe(base);
    expect(safeTxHash({ safe: SAFE, tx: { ...tx, value: 1n }, nonce: 0n })).not.toBe(base);
    expect(safeTxHash({ safe: SAFE, tx, nonce: 0n, chainId: 1 })).not.toBe(base);
  });
  it("rejects a zero amount", () => expect(() => usdcTransferTx(USDC, addr(), 0n)).toThrow());
  it("prevOwner follows the linked list", () => {
    const [a, b, c] = [addr(), addr(), addr()];
    expect(prevOwnerOf([a, b, c], a)).toBe(SAFE_SENTINEL);
    expect(prevOwnerOf([a, b, c], c)).toBe(getAddress(b));
    expect(() => prevOwnerOf([a, b, c], addr())).toThrow("Not an owner");
  });
  it("swapOwner refuses an existing owner, the zero address and the sentinel", () => {
    const [a, b, c] = [addr(), addr(), addr()];
    const args = { safe: SAFE as `0x${string}`, owners: [a, b, c], oldOwner: a };
    expect(() => swapOwnerTx({ ...args, newOwner: b })).toThrow("already");
    expect(() => swapOwnerTx({ ...args, newOwner: "0x0000000000000000000000000000000000000000" })).toThrow("Invalid");
    expect(() => swapOwnerTx({ ...args, newOwner: SAFE_SENTINEL })).toThrow("Invalid");
    const tx = swapOwnerTx({ ...args, newOwner: addr() });
    expect(tx.to).toBe(SAFE);
    expect(tx.value).toBe(0n);
  });
  it("packs signatures sorted by signer and refuses duplicates", () => {
    const lo = { signer: "0x0000000000000000000000000000000000000002" as const, signature: `0x${"11".repeat(65)}` as const };
    const hi = { signer: "0x0000000000000000000000000000000000000009" as const, signature: `0x${"22".repeat(65)}` as const };
    expect(packSignatures([hi, lo])).toBe(`0x${"11".repeat(65)}${"22".repeat(65)}`);
    expect(() => packSignatures([lo, lo])).toThrow("Duplicate");
  });
});
