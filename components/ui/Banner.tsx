import { Info, TriangleAlert, FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

export type BannerVariant = "info" | "warning" | "demo";

const config: Record<BannerVariant, { look: string; icon: ReactNode; role: "status" | "alert" }> = {
  info: { look: "bg-info-bg text-info", icon: <Info size={20} strokeWidth={1.75} />, role: "status" },
  warning: { look: "bg-warn-bg text-warn", icon: <TriangleAlert size={20} strokeWidth={1.75} />, role: "alert" },
  demo: { look: "bg-brand-tint text-ink", icon: <FlaskConical size={20} strokeWidth={1.75} className="text-brand" />, role: "status" },
};

type BannerProps = {
  variant?: BannerVariant;
  title?: string;
  children: ReactNode;
  /** Replaces the default icon of the variant (e.g. a lock). */
  icon?: ReactNode;
  /** Optional action, e.g. a "Cancel recovery" Button. */
  action?: ReactNode;
  className?: string;
};

export function Banner({ variant = "info", title, children, action, icon: customIcon, className = "" }: BannerProps) {
  const { look, icon, role } = config[variant];
  return (
    <div role={role} className={`flex gap-3 rounded-card p-4 ${look} ${className}`}>
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {customIcon ?? icon}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-5">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : ""}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
