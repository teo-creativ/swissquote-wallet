import type { ReactNode } from "react";
import { SimulatedPill } from "@/components/ui";

type PageTitleProps = {
  title: string;
  /** Count pill, e.g. "4 requests". */
  count?: string;
  /** Shows the Simulated pill (data that Swissquote's real systems would provide). */
  simulated?: boolean;
  children?: ReactNode;
};

export function PageTitle({ title, count, simulated, children }: PageTitleProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 border-b border-line pb-5">
      <h1 className="text-3xl font-semibold leading-9">{title}</h1>
      {count && <span className="rounded-pill bg-info-bg px-3 py-1 text-xs font-semibold text-info">{count}</span>}
      {simulated && <SimulatedPill />}
      {children && <div className="ml-auto text-sm text-muted">{children}</div>}
    </div>
  );
}
