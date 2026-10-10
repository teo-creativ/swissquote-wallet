import type { HTMLAttributes, ReactNode } from "react";

type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** Optional heading (h2). */
  title?: string;
  /** Right-aligned slot in the header: a chip, a button... */
  action?: ReactNode;
  /** Removes the body padding, for tables that run edge to edge. */
  flush?: boolean;
  children: ReactNode;
};

/** White card, 1px line, radius 24 (design.md section 1). */
export function Card({ title, action, flush = false, children, className = "", ...rest }: CardProps) {
  return (
    <section className={`overflow-hidden rounded-card border border-line bg-white ${className}`} {...rest}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-5 md:px-6">
          {title && <h2 className="text-lg font-semibold leading-6 text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={flush ? "pt-3" : "p-5 md:p-6"}>{children}</div>
    </section>
  );
}
