import type { ReactNode } from "react";
import { CoinIcon } from "./CoinIcon";

type HeroCardProps = {
  /** Small line above the amount, e.g. "Balance". */
  label?: string;
  /** Main figure as a display string, e.g. "1'250.00". Format amounts with lib/amounts, not here. */
  amount: string;
  currency?: string;
  /** Slot under the amount: delta pill, "Network fees are paid by Swissquote."... */
  children?: ReactNode;
  /** Slot in the top corners (profile / history icon buttons). */
  topLeft?: ReactNode;
  topRight?: ReactNode;
  className?: string;
};

/** CSS gradient + decorative USDC coins (one ETH), positioned like the mockup. No baked-in artwork. */
export function HeroCard({ label, amount, currency = "USDC", children, topLeft, topRight, className = "" }: HeroCardProps) {
  return (
    <section
      className={`relative min-h-[294px] overflow-hidden rounded-hero bg-gradient-to-b from-hero-top to-hero-bottom px-6 py-5 text-white ${className}`}
    >
      <CoinIcon coin="eth" size={46} className="absolute -left-3 top-[148px] drop-shadow-md" />
      <CoinIcon coin="usdc" size={64} className="absolute -right-3 top-[132px] drop-shadow-md" />
      <CoinIcon coin="usdc" size={72} className="absolute -bottom-3 -left-2 drop-shadow-md" />
      <CoinIcon coin="usdc" size={72} className="absolute -bottom-4 left-1/2 -translate-x-1/2 drop-shadow-md" />
      <CoinIcon coin="usdc" size={72} className="absolute -bottom-3 -right-2 drop-shadow-md" />

      <div className="relative flex items-start justify-between">
        <div>{topLeft}</div>
        <div>{topRight}</div>
      </div>
      <div className="relative mt-6 text-center">
        {label && <p className="text-[18px] font-semibold leading-6">{label}</p>}
        <p className="font-display text-[40px] font-semibold leading-[44px]">
          {amount} {currency}
        </p>
        {children && <div className="mt-3 flex justify-center">{children}</div>}
      </div>
    </section>
  );
}
