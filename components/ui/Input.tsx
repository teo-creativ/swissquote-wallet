import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { CircleAlert } from "lucide-react";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  hint?: string;
  /** Error text. Shown with an icon so it is never color-only. */
  error?: string;
  /** Trailing slot: QR button, "MAX" button... Keep each target at least 44px. */
  trailing?: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

export function Input({ label, hint, error, trailing, id, className = "", ref, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [hint ? `${inputId}-hint` : "", error ? `${inputId}-error` : ""].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-2 block px-1 text-sm font-medium text-ink">
        {label}
      </label>
      <div
        className={`flex h-14 items-center gap-2 rounded-pill bg-surface pl-5 pr-2 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-ink ${
          error ? "ring-2 ring-danger" : ""
        }`}
      >
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed disabled:text-muted"
          {...rest}
        />
        {trailing}
      </div>
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-2 px-1 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="mt-2 flex items-start gap-1.5 px-1 text-sm font-medium text-danger">
          <CircleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
