import { ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { SimulatedStrip } from "./SimulatedStrip";

/**
 * Centered mobile-style card on `surface` with the orange gradient header (design.md section 2, L1 to L3).
 * Used by the screens people see before they have a session.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  return (
    <>
      <SimulatedStrip />
      <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[460px] items-start px-4 py-6 sm:items-center sm:py-10">
        <div className="w-full overflow-hidden rounded-hero bg-white shadow-float">{children}</div>
      </main>
    </>
  );
}

export function AuthHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="bg-gradient-to-b from-hero-top to-hero-bottom px-6 pb-8 pt-6 text-white">
      <div className="flex items-center gap-2 text-sm font-medium">
        <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
        <span>
          SQ Keys <span className="opacity-90">Lawyer portal</span>
        </span>
      </div>
      <h1 className="mt-6 text-[28px] font-semibold leading-8">{title}</h1>
      {subtitle && <p className="mt-2 text-base leading-6">{subtitle}</p>}
    </header>
  );
}

export function AuthBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 px-6 pb-6 pt-6">{children}</div>;
}
