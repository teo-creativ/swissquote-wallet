import { Check } from "lucide-react";

type CheckHaloProps = {
  size?: number;
  className?: string;
};

/** Green circle with a soft glow. Decorative: put the meaning in the text next to it. */
export function CheckHalo({ size = 72, className = "" }: CheckHaloProps) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-ok text-white shadow-[0_0_0_10px_var(--color-ok-bg),0_0_32px_color-mix(in_srgb,var(--color-ok)_35%,transparent)] ${className}`}
    >
      <Check size={size * 0.5} strokeWidth={2.25} />
    </span>
  );
}
