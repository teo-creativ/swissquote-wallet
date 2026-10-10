import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  /** Visible label. Clicking it toggles the box; the whole row is at least 44px high. */
  children: ReactNode;
};

/** Native checkbox, brand colored. Never pre-checked by default: pass `defaultChecked` where the design says so. */
export function Checkbox({ children, id, className = "", ...rest }: CheckboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className={`flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-5 text-ink ${className}`}>
      <input id={inputId} type="checkbox" className="mt-0.5 size-5 shrink-0 cursor-pointer accent-brand" {...rest} />
      <span>{children}</span>
    </label>
  );
}
