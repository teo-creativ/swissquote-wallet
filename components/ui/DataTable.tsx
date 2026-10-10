import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes each row open this page. The first cell becomes a real link covering the whole row (keyboard + click). */
  rowHref?: (row: T) => string;
  /** Accessible name of the table. */
  caption: string;
  empty?: string;
  footer?: ReactNode;
};

/** White card, light header row, no zebra. Scrolls sideways instead of squashing columns on narrow screens. */
export function DataTable<T>({ columns, rows, rowKey, rowHref, caption, empty = "Nothing to show.", footer }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-[#FAFBFC]">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`whitespace-nowrap px-4 py-4 text-[11px] font-semibold uppercase tracking-wider text-muted ${c.className ?? ""}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-muted">
                  {empty}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={rowKey(row)} className={`relative border-t border-line ${rowHref ? "focus-within:bg-surface/60 hover:bg-surface/60" : ""}`}>
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-4 py-4 align-middle ${c.className ?? ""}`}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(row)} className="rounded-md after:absolute after:inset-0 after:content-['']">
                        {c.render(row)}
                      </Link>
                    ) : (
                      c.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="border-t border-line bg-[#FAFBFC] px-4 py-3 text-sm text-muted">{footer}</div>}
    </div>
  );
}
