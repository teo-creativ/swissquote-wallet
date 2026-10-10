import { describe, expect, it } from "vitest";
import type { PolicyEdit } from "./lawyerApi.types";
import { diffPolicy, normalizeAmount, validatePolicy } from "./policy";

const A = "0x3fD8a1C6e5B702d94A0c7E18b6F35d29a4C0e8B1";
const B = "0x84c0E5a7B1d3F962e0A4c8D7b5F13e69a2C0d4E8";

const base: PolicyEdit = {
  perTxCap: "5.00", dailyCap: "10.00", hourlyCount: 3, dailyCount: 6,
  newRecipientRequiresLawyer: true, approvedRecipients: [A], version: 1,
};

describe("normalizeAmount", () => {
  it("pads and trims to at least two decimals", () => {
    expect(normalizeAmount("5")).toBe("5.00");
    expect(normalizeAmount("5.5")).toBe("5.50");
    expect(normalizeAmount("5.000000")).toBe("5.00");
    expect(normalizeAmount("0.123456")).toBe("0.123456");
  });
  it("rejects anything that is not a USDC amount", () => {
    for (const bad of ["", "-1", "1.1234567", "1,5", "abc", "1e3", "."]) expect(normalizeAmount(bad)).toBeNull();
  });
});

describe("diffPolicy", () => {
  it("is empty for identical policies, ignoring amount formatting and address case", () => {
    const same = { ...base, perTxCap: "5", approvedRecipients: [A.toLowerCase()] };
    expect(diffPolicy(base, same).isEmpty).toBe(true);
  });

  it("lists each changed limit with before and after, using the annex F.5 labels", () => {
    const next = { ...base, perTxCap: "8", dailyCap: "20.50", hourlyCount: 2, dailyCount: 9 };
    const { changes, isEmpty } = diffPolicy(base, next);
    expect(isEmpty).toBe(false);
    expect(changes).toEqual([
      { field: "perTxCap", label: "Per transfer", before: "5.00 USDC", after: "8.00 USDC" },
      { field: "dailyCap", label: "Per day", before: "10.00 USDC", after: "20.50 USDC" },
      { field: "hourlyCount", label: "Transfers per hour", before: "3", after: "2" },
      { field: "dailyCount", label: "Transfers per day", before: "6", after: "9" },
    ]);
  });

  it("reports the unknown-recipient switch", () => {
    const { changes } = diffPolicy(base, { ...base, newRecipientRequiresLawyer: false });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: "newRecipientRequiresLawyer", before: "On", after: "Off" });
  });

  it("reports added and removed recipients, deduplicated", () => {
    const next = { ...base, approvedRecipients: [B, B.toLowerCase()] };
    const diff = diffPolicy(base, next);
    expect(diff.addedRecipients).toEqual([B]);
    expect(diff.removedRecipients).toEqual([A]);
    expect(diff.changes).toEqual([]);
    expect(diff.isEmpty).toBe(false);
  });

  it("ignores the version field", () => {
    expect(diffPolicy(base, { ...base, version: 7 }).isEmpty).toBe(true);
  });
});

describe("validatePolicy", () => {
  it("accepts the default policy", () => {
    expect(validatePolicy(base)).toEqual([]);
  });
  it("rejects bad amounts, counts and addresses", () => {
    expect(validatePolicy({ ...base, perTxCap: "-1" })).toHaveLength(1);
    expect(validatePolicy({ ...base, dailyCap: "x" })).toHaveLength(1);
    expect(validatePolicy({ ...base, hourlyCount: 1.5 })).toHaveLength(1);
    expect(validatePolicy({ ...base, dailyCount: -1 })).toHaveLength(1);
    expect(validatePolicy({ ...base, approvedRecipients: ["0x123"] })).toHaveLength(1);
  });
  it("rejects a per-transfer limit above the daily limit, and allows zero (manual mode)", () => {
    expect(validatePolicy({ ...base, perTxCap: "11" })).toEqual(["Per transfer cannot be higher than per day."]);
    expect(validatePolicy({ ...base, perTxCap: "0" })).toEqual([]);
  });
});
