import type { ReactNode } from "react";

type StatProps = {
  label: string;
  value: ReactNode;
  /** Small line under the value: "last 24 hours"... */
  note?: string;
  icon?: ReactNode;
  className?: string;
};

/** Dashboard counter (L4): label, big number, optional note. */
export function Stat({ label, value, note, icon, className = "" }: StatProps) {
  return (
    <div className={`rounded-card border border-line bg-white p-5 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{label}</span>
        {icon && (
          <span aria-hidden="true" className="text-brand">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-3xl font-semibold leading-9 text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
}
