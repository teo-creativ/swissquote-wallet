// Swissquote console shell (desktop). Skeleton only: prompt console/01 builds sidebar, top bar and screens (app/console/design.md).
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface">
      <div className="bg-ink px-4 py-1.5 text-center text-xs font-medium uppercase tracking-widest text-white">
        Student prototype · Testnet · No real funds
      </div>
      {children}
    </div>
  );
}
