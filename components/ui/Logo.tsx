// The SVG wraps a 551 x 350 raster and displays at 97 x 20: keep it at <= 2x (design.md section 3).
const NATURAL_WIDTH = 97;
const NATURAL_HEIGHT = 20;

type LogoProps = {
  /** 1 = natural size, 2 = maximum. */
  scale?: 1 | 1.5 | 2;
  /** Adds the "SQ Keys" product name in Outfit next to the logo. */
  withProductName?: boolean;
  className?: string;
};

export function Logo({ scale = 1.5, withProductName = false, className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src="/brand/swissquote-logo.svg"
        alt="Swissquote"
        width={NATURAL_WIDTH * scale}
        height={NATURAL_HEIGHT * scale}
      />
      {withProductName && <span className="font-display text-[22px] font-semibold leading-7 text-ink">SQ Keys</span>}
    </span>
  );
}
