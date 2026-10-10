import { FlaskConical } from "lucide-react";

type SimulatedPillProps = {
  /** Defaults to "Simulated". Annex F.1 variants: "Simulated Swissquote login", "Simulated identity check"... */
  children?: string;
  className?: string;
};

/** Anything simulated carries this pill (CLAUDE.md rule 7). */
export function SimulatedPill({ children = "Simulated", className = "" }: SimulatedPillProps) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-pill bg-info-bg px-2.5 text-[11px] font-medium leading-[14px] text-info ${className}`}
    >
      <FlaskConical size={14} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </span>
  );
}
