/**
 * Shared pill primitive for every status label in the Design Canvas mock's
 * "Badges" sheet: ✓ Verified · Following · Losing agent · Killed · Pending ·
 * BUY · SELL.
 */
const VARIANTS = {
  verified: "border-chrome/35 bg-chrome/5 text-chrome",
  following: "border-accent/40 bg-accent/10 text-accent",
  losing: "border-loss/40 bg-loss/10 text-loss",
  killed: "border-chrome-dim/60 bg-white/[0.03] text-muted",
  pending: "border-warn/40 bg-warn/10 text-warn",
  buy: "border-profit/40 bg-profit/10 text-profit",
  sell: "border-loss/40 bg-loss/10 text-loss",
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide transition-[filter,box-shadow] duration-200 hover:shadow-[0_0_12px_-2px_currentColor] hover:brightness-125 ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
