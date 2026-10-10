import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "danger" | "dark" | "ghost";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  children: ReactNode;
  /** Optional icon (lucide, size 24) shown before the label. */
  icon?: ReactNode;
  /** Optional icon after the label, e.g. a chevron. */
  trailingIcon?: ReactNode;
  /** Shows a spinner and blocks clicks. Keeps the label so the width does not jump. */
  loading?: boolean;
  fullWidth?: boolean;
};

const enabled: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white",
  secondary: "bg-surface text-ink",
  /** Same shape as secondary, red text: "Decline with passkey". */
  danger: "bg-surface text-danger",
  dark: "bg-dark text-white",
  ghost: "bg-transparent text-ink",
};

// Disabled primary uses brand-soft (design.md section 2). Other variants fade the same way.
const disabled: Record<ButtonVariant, string> = {
  primary: "bg-brand-soft text-white",
  secondary: "bg-surface text-muted",
  danger: "bg-surface text-muted",
  dark: "bg-line text-muted",
  ghost: "bg-transparent text-muted",
};

export function Button({
  variant = "primary",
  children,
  icon,
  trailingIcon,
  loading = false,
  fullWidth = true,
  disabled: isDisabled = false,
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  const blocked = isDisabled || loading;
  const look = isDisabled ? disabled[variant] : enabled[variant];
  return (
    <button
      type={type}
      disabled={blocked}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-14 items-center justify-center gap-2 rounded-pill px-6 text-[18px] font-semibold leading-6 transition-colors duration-200 ease-out disabled:cursor-not-allowed ${
        fullWidth ? "w-full" : ""
      } ${look} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={22} tone="current" label="" /> : icon}
      <span>{children}</span>
      {!loading && trailingIcon}
      {loading && <span className="sr-only">Loading</span>}
    </button>
  );
}
