import { describe, expect, it } from "vitest";
import { fromBase, toBase } from "./amounts";

describe("amounts (U2)", () => {
  it("converts both ways", () => {
    expect(toBase("5.00")).toBe("5000000");
    expect(toBase("0.000001")).toBe("1");
    expect(fromBase("5000000")).toBe("5.00");
  });
  it("rejects 7 decimals and negatives", () => {
    expect(() => toBase("1.0000001")).toThrow();
    expect(() => toBase("-1")).toThrow();
  });
});
