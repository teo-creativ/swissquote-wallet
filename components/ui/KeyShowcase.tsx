const illustrations = {
  phone: { src: "/illustrations/phone-key.png", alt: "A phone with the Phone key row highlighted", width: 390, height: 542 },
  lawyer: { src: "/illustrations/phone-lawyer.png", alt: "A phone with the Your lawyer row highlighted", width: 390, height: 541 },
};

type KeyShowcaseProps = {
  /** Which third of the key to showcase (C4 = phone, C5 = lawyer). */
  variant: keyof typeof illustrations;
  className?: string;
};

// The PNGs still contain baked text ("Secondary Key", BTC, CHF): placeholders until re-exported from Figma (design.md section 3).
export function KeyShowcase({ variant, className = "" }: KeyShowcaseProps) {
  const { src, alt, width, height } = illustrations[variant];
  return (
    <div className={`mx-auto w-full max-w-[390px] ${className}`}>
      <img src={src} alt={alt} width={width} height={height} className="h-auto w-full" />
    </div>
  );
}
