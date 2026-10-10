import Link from "next/link";
import type { ReactNode } from "react";

export type TabItem = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Renders a link. Without it the item is a button that calls onSelect. */
  href?: string;
};

type TabBarProps = {
  items: TabItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  className?: string;
};

/** Floating pill. Active item = dark circle, marked with aria-current. Labels stay available to screen readers. */
export function TabBar({ items, activeId, onSelect, className = "" }: TabBarProps) {
  return (
    <nav
      aria-label="Main"
      className={`mx-auto flex w-fit items-center gap-1 rounded-pill bg-surface p-1.5 shadow-float ${className}`}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const look = `flex size-12 items-center justify-center rounded-full transition-colors duration-200 ease-out ${
          active ? "bg-dark text-white" : "text-ink"
        }`;
        const content = (
          <>
            <span aria-hidden="true">{item.icon}</span>
            <span className="sr-only">{item.label}</span>
          </>
        );
        return item.href ? (
          <Link key={item.id} href={item.href} aria-current={active ? "page" : undefined} className={look}>
            {content}
          </Link>
        ) : (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect?.(item.id)}
            className={look}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}
