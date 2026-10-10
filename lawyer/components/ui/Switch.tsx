import { useId } from "react";
import type { ReactNode } from "react";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  /** Small line under the label. */
  hint?: string;
  disabled?: boolean;
  className?: string;
};

/** On/off switch (role="switch"). The label is the whole row, at least 44px high. */
export function Switch({ checked, onChange, children, hint, disabled = false, className = "" }: SwitchProps) {
  const id = useId();
  return (
    <div className={`flex min-h-11 items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium leading-5 text-ink">
          {children}
        </label>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-brand" : "bg-line"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow-float transition-transform duration-200 ease-out ${
            checked ? "translate-x-5" : ""
          }`}
        />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
