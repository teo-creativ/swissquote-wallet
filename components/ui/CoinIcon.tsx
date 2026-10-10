const sources = {
  usdc: "/coins/usdc.svg",
  // ETH only appears as the small "network fee" indicator (scope is USDC only).
  eth: "/coins/eth.png",
};

type CoinIconProps = {
  coin: keyof typeof sources;
  size?: number;
  /** Decorative by default. Pass a label (e.g. "USDC") when the coin is the only identifier. */
  label?: string;
  className?: string;
};

export function CoinIcon({ coin, size = 40, label = "", className = "" }: CoinIconProps) {
  return (
    <img
      src={sources[coin]}
      alt={label}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
    />
  );
}
