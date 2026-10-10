import { ShieldCheck } from "lucide-react";
import { Avatar } from "./Avatar";

/** Shield + breadcrumb on the left, testnet pill and avatar on the right (design.md section 1). */
export function TopBar({ lawyerName, section }: { lawyerName: string; section?: string }) {
  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-line bg-white px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <ShieldCheck size={20} strokeWidth={1.75} className="shrink-0 text-brand" aria-hidden="true" />
        <span className="truncate font-medium text-ink">SQ Keys Lawyer portal</span>
        {section && (
          <>
            <span aria-hidden="true" className="text-muted">
              /
            </span>
            <span className="truncate text-muted">{section}</span>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="inline-flex h-6 items-center rounded-pill bg-info-bg px-2.5 text-[11px] font-medium leading-[14px] text-info">
          Testnet environment
        </span>
        <Avatar name={lawyerName} />
      </div>
    </header>
  );
}
