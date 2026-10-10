// Client app shell: 430px column, centered on desktop (design.md section 1).
export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto min-h-dvh w-full max-w-[430px]">{children}</div>
      <footer className="mx-auto max-w-[430px] px-4 py-3 text-center text-xs text-muted">
        Student prototype. Not an official Swissquote product. Testnet only: no real funds.
        <br />We only use cookies that are strictly necessary.
      </footer>
    </>
  );
}
