type SpinnerProps = {
  size?: number;
  /** "brand" = orange arc (default), "current" = inherits the text color (use inside buttons). */
  tone?: "brand" | "current";
  /** Accessible name. Pass "" when the surrounding text already says what is loading. */
  label?: string;
  className?: string;
};

export function Spinner({ size = 24, tone = "brand", label = "Loading", className = "" }: SpinnerProps) {
  const color = tone === "brand" ? "border-brand" : "border-current";
  return (
    <span
      data-spinner
      role={label ? "status" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 animate-spin rounded-full border-[3px] border-t-transparent ${color} ${className}`}
    />
  );
}
