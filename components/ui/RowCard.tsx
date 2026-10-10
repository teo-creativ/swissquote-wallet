import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

type RowCardProps = {
  title: string;
  subtitle?: string;
  /** Leading icon or coin (size 20 for icons). */
  leading?: ReactNode;
  /** Trailing content: a StatusChip, an amount... */
  trailing?: ReactNode;
  /** Makes the whole row a link. */
  href?: string;
  /** Makes the whole row a button. Ignored when href is set. */
  onClick?: () => void;
  className?: string;
};

const base = "flex min-h-16 w-full items-center gap-3 rounded-card bg-surface px-4 py-3 text-left";

export function RowCard({ title, subtitle, leading, trailing, href, onClick, className = "" }: RowCardProps) {
  const interactive = Boolean(href || onClick);
  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center text-brand">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-ink">{title}</span>
        {subtitle && <span className="block truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center">{trailing}</span>}
      {interactive && !trailing && <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={`${base} ${className}`}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${className}`}>
        {body}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{body}</div>;
}
