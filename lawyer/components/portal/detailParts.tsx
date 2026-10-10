import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function Breadcrumb({ current, parent = { label: "Requests", href: "/requests" } }: { current: string; parent?: { label: string; href: string } }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
      <Link href={parent.href} className="inline-flex min-h-11 items-center rounded-pill pr-1 font-medium text-warn">
        {parent.label}
      </Link>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      <span aria-current="page">{current}</span>
    </nav>
  );
}

export function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">{children}</dd>
    </div>
  );
}
