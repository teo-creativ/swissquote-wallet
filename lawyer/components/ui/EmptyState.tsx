import type { ReactNode } from "react";

type EmptyStateProps = {
  /** Default wording from design.md section 3. */
  title?: string;
  children?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title = "No pending requests.", children, icon, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center px-6 py-12 text-center ${className}`}>
      {icon && (
        <span aria-hidden="true" className="mb-4 flex size-14 items-center justify-center rounded-full bg-brand-tint text-brand">
          {icon}
        </span>
      )}
      <p className="font-display text-lg font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
