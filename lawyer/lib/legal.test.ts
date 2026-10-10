import { describe, expect, it } from "vitest";
import { LAWYER_TERMS_VERSION, LEGAL_DOCS, findLegalDoc } from "./legal";
import { parseMarkdown } from "./markdown";

describe("legal pages", () => {
  it("has the three L10 pages with unique slugs", () => {
    expect(LEGAL_DOCS.map((d) => d.slug)).toEqual(["role", "data", "privacy"]);
    expect(findLegalDoc("nope")).toBeUndefined();
  });
  it("parses into blocks and never overclaims (CLAUDE.md rule 7)", () => {
    for (const d of LEGAL_DOCS) {
      expect(parseMarkdown(d.body).length).toBeGreaterThan(2);
      expect(d.body).not.toMatch(/unbreakable|100% secure|FINMA compliant/i);
    }
  });
  it("shows no placeholder or unverified marker to the user", () => {
    for (const d of LEGAL_DOCS) {
      expect(d.body).not.toMatch(/placeholder|to be completed|\[TO VERIFY\]|draft/i);
    }
  });
  it("has a version label", () => {
    expect(LAWYER_TERMS_VERSION).toBe("1.0");
  });
  it("states the role limits from CDC 7.1", () => {
    const role = findLegalDoc("role")!.body;
    expect(role).toContain("never move funds alone");
    expect(role).toContain("do not see the client's everyday transfers");
  });
});
