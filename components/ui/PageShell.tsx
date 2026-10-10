import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

type PageShellProps = {
  title?: string;
  subtitle?: string;
  /** Shows a back arrow. Use href for navigation or onBack for in-page steps. */
  backHref?: string;
  onBack?: () => void;
  /** Sticky area at the bottom: the one primary action of the screen. */
  footer?: ReactNode;
  /** Floating TabBar slot, pinned above the bottom edge. */
  tabBar?: ReactNode;
  children: ReactNode;
  className?: string;
};

const backClass = "-ml-2 flex size-11 items-center justify-center rounded-full text-ink";

/** Screen frame inside the 430px column: gutters 16px, optional back arrow, title, sticky footer. */
export function PageShell({ title, subtitle, backHref, onBack, footer, tabBar, children, className = "" }: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <main className={`flex-1 px-4 pt-4 ${tabBar ? "pb-28" : "pb-6"} ${className}`}>
        {(backHref || onBack) &&
          (backHref ? (
            <Link href={backHref} aria-label="Back" className={backClass}>
              <ChevronLeft size={24} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" onClick={onBack} aria-label="Back" className={backClass}>
              <ChevronLeft size={24} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ))}
        {title && (
          <header className="mb-6 mt-3">
            <h1 className="text-[28px] font-semibold leading-8 text-ink">{title}</h1>
            {subtitle && <p className="mt-2 text-base leading-6 text-muted">{subtitle}</p>}
          </header>
        )}
        {children}
      </main>
      {footer && <div className="sticky bottom-0 bg-white px-4 pb-6 pt-3">{footer}</div>}
      {tabBar && <div className="pointer-events-none fixed inset-x-0 bottom-4 z-10 mx-auto max-w-[430px]"><div className="pointer-events-auto">{tabBar}</div></div>}
    </div>
  );
}
