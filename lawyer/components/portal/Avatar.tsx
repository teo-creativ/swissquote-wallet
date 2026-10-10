type AvatarProps = { name: string; className?: string };

/** Initials on brand-tint. Decorative: the name is always shown next to it or given as a label. */
export function Avatar({ name, className = "" }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint font-display text-sm font-semibold text-warn ${className}`}
    >
      {initials}
    </span>
  );
}
