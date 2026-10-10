import { describe, expect, it } from "vitest";
import { formatRemaining } from "./countdown";

describe("formatRemaining", () => {
  it("formats minutes and seconds", () => {
    expect(formatRemaining(160_000)).toBe("02:40");
    expect(formatRemaining(0)).toBe("00:00");
  });
  it("adds hours from one hour up", () => {
    expect(formatRemaining(3_600_000)).toBe("01:00:00");
    expect(formatRemaining(48 * 3_600_000)).toBe("48:00:00");
  });
  it("never goes negative and rounds down to the second", () => {
    expect(formatRemaining(-5000)).toBe("00:00");
    expect(formatRemaining(1999)).toBe("00:01");
  });
});
