import type { ReactNode } from "react";

export type TableColumn<Row> = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
  /** Right-aligns numbers. */
  align?: "left" | "right";
  /** Hides the column below 768px so the table stays usable at 390px. */
  hideOnMobile?: boolean;
};

type TableProps<Row> = {
  columns: TableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Accessible name of the table. */
  caption: string;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  className?: string;
};

/**
 * Header row muted uppercase 12px, 64px rows (design.md section 1). Put it in a flush Card.
 * Rows are not clickable on purpose: put a real link or Button in a cell so keyboard users can open it.
 */
export function Table<Row>({ columns, rows, rowKey, caption, empty, className = "" }: TableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-y border-line bg-surface/50">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted md:px-6 ${
                  c.align === "right" ? "text-right" : ""
                } ${c.hideOnMobile ? "hidden md:table-cell" : ""}`}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="h-16 border-b border-line last:border-b-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2 text-ink md:px-6 ${c.align === "right" ? "text-right" : ""} ${
                    c.hideOnMobile ? "hidden md:table-cell" : ""
                  }`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
