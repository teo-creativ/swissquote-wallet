// Swissquote console shell (desktop, simulated back-office). Design: app/console/design.md.
import Link from "next/link";
import { Bell, Lock, LogOut, PhoneCall, ShieldCheck, ShieldHalf, User, Wallet, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Banner, Logo, Sidebar, SimulatedPill } from "@/components/ui";
import type { SidebarItem } from "@/components/ui";
import { gateConfigured, isAuthed } from "@/lib/console.auth";
import { logoutAction } from "./actions";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "SQ Keys Console (simulated)" };

const icon = { size: 20, strokeWidth: 1.75 } as const;
const nav: SidebarItem[] = [
  { href: "/console/clients", label: "Client wallets", icon: <Wallet {...icon} /> },
  { href: "/console/proofs", label: "Ownership proofs", icon: <ShieldCheck {...icon} /> },
  { href: "/console/recoveries", label: "Recoveries", icon: <KeyRound {...icon} /> },
  { href: "/console/alerts", label: "Compliance alerts", icon: <Bell {...icon} /> },
  { href: "/console/calls", label: "Calls", icon: <PhoneCall {...icon} /> },
];

function TopStrip() {
  return (
    <div className="bg-ink px-4 py-1.5 text-center text-xs font-medium uppercase tracking-widest text-white">
      Student prototype · Testnet · No real funds
    </div>
  );
}

// Same pattern as the mobile layout. The cookie line is true to lib/console.auth.ts: one session cookie, nothing else.
function ConsoleFooter() {
  return (
    <footer className="border-t border-line bg-white px-6 py-3 text-center text-xs text-muted">
      Student prototype. Not an official Swissquote product. Testnet only: no real funds.
      <br />This console sets one session cookie, strictly necessary to keep you signed in. Nothing else.
      <br />
      <Link href="/legal/cookies" className="inline-flex min-h-11 items-center px-2 underline">Cookies</Link>
      <Link href="/legal/notice" className="inline-flex min-h-11 items-center px-2 underline">Legal notice</Link>
    </footer>
  );
}

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthed())) {
    return (
      <div className="flex min-h-dvh flex-col bg-surface">
        <TopStrip />
        <main className="flex flex-1 items-center justify-center p-6">
          <LoginForm configured={gateConfigured()} />
        </main>
        <ConsoleFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <TopStrip />
      <div className="flex flex-1">
        <Sidebar
          items={nav}
          ariaLabel="Console"
          header={
            <>
              <Logo scale={1.5} />
              <p className="mt-3 flex items-baseline justify-between gap-2 font-display text-lg font-semibold leading-6">
                Console <span className="text-sm font-normal text-muted">(simulated)</span>
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-warn">SQ Keys · Core custody</p>
            </>
          }
          footer={
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">Active operator</p>
                <SimulatedPill />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-warn text-white">
                  <User size={18} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Audit &amp; Risk Officer</p>
                  <p className="font-mono text-[11px] text-muted">ID: SQK-88192-GE</p>
                </div>
              </div>
            </>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-line bg-white px-6 py-3">
            <ShieldHalf size={20} strokeWidth={1.75} className="shrink-0 text-info" aria-hidden="true" />
            <p className="min-w-0 truncate text-sm font-semibold">
              SQ Keys Admin Console
              <span className="mx-2 font-normal text-line">/</span>
              <span className="text-xs font-normal uppercase tracking-wider text-muted">MPC multi-signature infrastructure</span>
            </p>
            <span className="ml-auto inline-flex h-7 shrink-0 items-center gap-2 rounded-md border border-info/30 bg-info-bg px-3 text-[11px] font-semibold uppercase tracking-wider text-info">
              <span className="size-1.5 rounded-full bg-info" aria-hidden="true" />
              Testnet environment
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="flex size-10 items-center justify-center rounded-full bg-warn text-white"
              >
                <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </form>
          </header>
          <main className="flex-1 p-6">
            <Banner icon={<Lock size={20} strokeWidth={1.75} />} title="What Swissquote cannot do" className="mb-6">
              Send or spend a client&apos;s funds. Take control of an account without the client&apos;s lawyer. Stop a client from cancelling a recovery.
            </Banner>
            {children}
          </main>
          <ConsoleFooter />
        </div>
      </div>
    </div>
  );
}

