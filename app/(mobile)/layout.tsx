import Link from "next/link";
import { RecoveryBanner } from "./_lib/RecoveryBanner";

// Client app shell: 430px column, centered on desktop (design.md section 1).
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto min-h-dvh w-full max-w-[430px]">
        <RecoveryBanner />
        {children}
      </div>
      <footer className="mx-auto max-w-[430px] px-4 py-3 text-center text-xs text-muted">
        Student prototype. Not an official Swissquote product. Testnet only: no real funds.
        <br />We only use cookies that are strictly necessary.
        <br />
        <Link href="/legal/cookies" className="inline-flex min-h-11 items-center px-2 underline">Cookies</Link>
        <Link href="/legal/notice" className="inline-flex min-h-11 items-center px-2 underline">Legal notice</Link>
      </footer>
    </>
  );
}
