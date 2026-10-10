"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type SidebarItem = { href: string; label: string; icon: ReactNode };

type SidebarProps = {
  /** Brand block at the top (logo + product name). */
  header: ReactNode;
  items: SidebarItem[];
  /** Pinned at the bottom, e.g. the operator block. */
  footer?: ReactNode;
  ariaLabel?: string;
};

/** 240px desktop navigation. Active item = brand-tint pill with warn text. */
export function Sidebar({ header, items, footer, ariaLabel = "Main" }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col self-start border-r border-line bg-white">
      <div className="border-b border-line px-6 py-5">{header}</div>
      <nav aria-label={ariaLabel} className="flex-1 p-3">
        <ul className="flex flex-col gap-1">
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-pill px-4 text-sm font-medium ${active ? "bg-brand-tint text-warn" : "text-muted hover:bg-surface hover:text-ink"}`}
                >
                  <span aria-hidden="true">{it.icon}</span>
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && <div className="border-t border-line p-4">{footer}</div>}
    </aside>
  );
}
