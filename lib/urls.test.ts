import { describe, expect, it } from "vitest";
import { inviteUrl, lawyerBaseUrl } from "./urls";

describe("invitation URL", () => {
  it("uses the configured lawyer URL, without a trailing slash", () => {
    expect(inviteUrl("abc", "https://sq-keys-lawyer.vercel.app/", "production")).toBe("https://sq-keys-lawyer.vercel.app/invite/abc");
  });
  it("never contains localhost in production", () => {
    expect(() => inviteUrl("abc", undefined, "production")).toThrow(/not set up/);
    expect(() => inviteUrl("abc", "   ", "production")).toThrow();
    expect(inviteUrl("abc", "https://sq-keys-lawyer.vercel.app", "production")).not.toContain("localhost");
  });
  it("falls back to localhost:3001 only in development", () => {
    expect(inviteUrl("abc", undefined, "development")).toBe("http://localhost:3001/invite/abc");
    expect(() => lawyerBaseUrl(undefined, "test")).toThrow();
  });
});
