import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("reads headings, paragraphs and lists", () => {
    const md = ["## Title", "", "First line", "second line.", "", "- one", "- two", "", "### Sub", "Text"].join("\n");
    expect(parseMarkdown(md)).toEqual([
      { type: "h2", text: "Title" },
      { type: "p", text: "First line second line." },
      { type: "ul", items: ["one", "two"] },
      { type: "h3", text: "Sub" },
      { type: "p", text: "Text" },
    ]);
  });
  it("ends a list when a paragraph follows without a blank line", () => {
    expect(parseMarkdown("- a\nplain")).toEqual([
      { type: "ul", items: ["a"] },
      { type: "p", text: "plain" },
    ]);
  });
  it("returns nothing for empty input", () => {
    expect(parseMarkdown("  \n\n")).toEqual([]);
  });
  it("never produces markup: angle brackets stay as text", () => {
    expect(parseMarkdown("<script>alert(1)</script>")).toEqual([{ type: "p", text: "<script>alert(1)</script>" }]);
  });
});

describe("parseInline", () => {
  it("marks bold parts", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });
  it("keeps unbalanced markers as plain text", () => {
    expect(parseInline("a **b")).toEqual([{ text: "a **b", bold: false }]);
  });
});
