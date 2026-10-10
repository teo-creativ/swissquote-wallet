"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "./Avatar";
import { NAV_ITEMS, isActive } from "./nav";
import { SimulatedPill } from "@/components/ui";

/** Desktop sidebar, 240px, white. Hidden below 768px where MobileTabBar takes over. */
export function Sidebar({ lawyerName }: { lawyerName: string }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-white md:flex">
      <div className="px-6 pb-6 pt-7">
        <Link href="/" className="block rounded-lg">
          <span className="font-display text-[22px] font-semibold leading-7 text-ink">SQ Keys</span>
          <span className="block text-xs text-muted">Lawyer portal</span>
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-12 items-center gap-3 rounded-pill px-4 text-sm font-medium transition-colors duration-200 ease-out ${
                    active ? "bg-brand-tint text-warn" : "text-ink hover:bg-surface"
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex items-center gap-3 border-t border-line p-4">
        <Avatar name={lawyerName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{lawyerName}</p>
          <SimulatedPill className="mt-1" />
        </div>
      </div>
    </aside>
  );
}
