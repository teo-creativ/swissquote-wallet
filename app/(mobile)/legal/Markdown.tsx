import type { ReactNode } from "react";
import { Banner } from "@/components/ui";

// Minimal renderer for our own legal files (content/legal/*.md): ## and ### headings, paragraphs,
// "- " lists, "> " notes and **bold**. Raw HTML is never interpreted: everything goes through React text nodes.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

export function Markdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.startsWith("# ")) {
      i++; // blank line, or the file title (the page header already shows it)
    } else if (line.startsWith("### ")) {
      blocks.push(<h3 key={i} className="mt-6 text-base font-semibold text-ink">{inline(line.slice(4))}</h3>);
      i++;
    } else if (line.startsWith("## ")) {
      blocks.push(<h2 key={i} className="mt-8 text-[22px] font-semibold leading-7 text-ink">{inline(line.slice(3))}</h2>);
      i++;
    } else if (line.startsWith("> ")) {
      const note: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) note.push(lines[i++].slice(2));
      blocks.push(<Banner key={i} variant="warning" className="mt-4">{inline(note.join(" "))}</Banner>);
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      blocks.push(
        <ul key={i} className="mt-3 list-disc pl-6 text-base leading-6 text-ink">
          {items.map((t, n) => <li key={n}>{inline(t)}</li>)}
        </ul>,
      );
    } else {
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,3} |> |- )/.test(lines[i])) para.push(lines[i++]);
      blocks.push(<p key={i} className="mt-3 text-base leading-6 text-ink">{inline(para.join(" "))}</p>);
    }
  }
  return <div>{blocks}</div>;
}
