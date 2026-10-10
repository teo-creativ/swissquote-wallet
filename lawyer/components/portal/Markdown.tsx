import { parseInline, parseMarkdown } from "@/lib/markdown";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((part, i) =>
        part.bold ? (
          <strong key={i} className="font-semibold">
            {part.text}
          </strong>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** Renders the markdown subset as React nodes. Headings start at h2: the page owns the h1. */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-3 text-base leading-7 text-ink">
      {parseMarkdown(source).map((block, i) => {
        switch (block.type) {
          case "h2":
            return (
              <h2 key={i} className="mt-4 text-xl font-semibold leading-7 first:mt-0">
                {block.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-2 text-lg font-semibold leading-6">
                {block.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="ml-5 flex list-disc flex-col gap-1.5 marker:text-brand">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i}>
                <Inline text={block.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
