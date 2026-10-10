// A deliberately tiny markdown subset for the legal placeholders: ## / ### headings, "- " lists, paragraphs, **bold**.
// It returns data (no HTML), so the renderer builds React nodes and nothing is ever injected as markup.

export type MdBlock =
  | { type: "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] };

export function parseMarkdown(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "ul", items: list });
    list = null;
  };

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") {
      flushParagraph();
      flushList();
    } else if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h3", text: line.slice(4) });
    } else if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h2", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      flushParagraph();
      (list ??= []).push(line.slice(2));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Splits a line into plain and **bold** parts. Unbalanced markers stay as text. */
export function parseInline(text: string): { text: string; bold: boolean }[] {
  const parts: { text: string; bold: boolean }[] = [];
  const pieces = text.split("**");
  const balanced = pieces.length % 2 === 1;
  pieces.forEach((piece, i) => {
    if (piece === "") return;
    parts.push({ text: piece, bold: balanced && i % 2 === 1 });
  });
  return balanced ? parts : [{ text, bold: false }];
}
