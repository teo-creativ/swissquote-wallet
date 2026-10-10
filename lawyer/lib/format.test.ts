import { describe, expect, it } from "vitest";
import {
  autoTotalsLine,
  formatAge,
  formatDate,
  formatDateTime,
  formatTime,
  formatUpdated,
  integrityLabel,
  shortAddress,
  shortHash,
} from "./format";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

describe("formatAge", () => {
  it("picks the right unit", () => {
    expect(formatAge(ago(5), NOW)).toBe("just now");
    expect(formatAge(ago(4 * 60 + 10), NOW)).toBe("4 min ago");
    expect(formatAge(ago(2 * 3600 + 5), NOW)).toBe("2 h ago");
    expect(formatAge(ago(86400), NOW)).toBe("1 day ago");
    expect(formatAge(ago(3 * 86400), NOW)).toBe("3 days ago");
  });
  it("treats future dates as just now", () => {
    expect(formatAge(ago(-30), NOW)).toBe("just now");
  });
});

describe("formatUpdated", () => {
  it("counts seconds, then minutes", () => {
    expect(formatUpdated(NOW - 3000, NOW)).toBe("Updated 3 s ago");
    expect(formatUpdated(NOW, NOW)).toBe("Updated 0 s ago");
    expect(formatUpdated(NOW - 125_000, NOW)).toBe("Updated 2 min ago");
  });
});

describe("shortAddress / shortHash", () => {
  it("shortens long values and keeps short ones", () => {
    expect(shortAddress("0x9c1D5e07A2b84F36d0E9a5C7b13F48e2d6A0b7c4")).toBe("0x9c1D…b7c4");
    expect(shortAddress("0x1234")).toBe("0x1234");
    expect(shortHash("9f2c41d7a0b34e58c61d0e2a7b8f3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d")).toBe("0x9f2c41…b3c4d");
    expect(shortHash("0xabc")).toBe("0xabc");
  });
});

describe("date and time", () => {
  const iso = "2026-10-10T15:22:14Z";
  it("formats in the requested zone", () => {
    expect(formatDate(iso, "UTC")).toBe("10 Oct 2026");
    expect(formatTime(iso, "UTC")).toBe("15:22:14");
    expect(formatDateTime(iso, "UTC")).toBe("10 Oct 2026, 15:22");
  });
});

describe("annex F.6 journal texts", () => {
  it("prints the integrity badge exactly", () => {
    expect(integrityLabel({ ok: true })).toBe("Journal integrity: OK");
    expect(integrityLabel({ ok: false, firstFailure: "7" })).toBe("Journal integrity: FAILED at entry 7");
  });
  it("prints the automatic totals line exactly", () => {
    expect(autoTotalsLine({ count: 14, totalUsdc: "37.00" })).toBe("Automatic decisions in the last 24 hours: 14, total 37.00 USDC");
  });
});
