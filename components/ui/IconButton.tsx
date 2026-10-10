import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  /** Required: an icon alone has no accessible name. */
  label: string;
  icon: ReactNode;
  variant?: "surface" | "dark" | "ghost";
};

const looks = {
  surface: "bg-surface text-ink",
  dark: "bg-dark text-white",
  ghost: "bg-transparent text-ink",
};

/** 44px circle (minimum touch target). */
export function IconButton({ label, icon, variant = "surface", type = "button", className = "", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${looks[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}
