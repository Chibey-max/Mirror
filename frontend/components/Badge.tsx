/**
 * Shared pill primitive for every status label in the Design Canvas mock's
 * "Badges" sheet: ✓ Verified · Following · Losing agent · Killed · Pending ·
 * BUY · SELL.
 */
const VARIANTS = {
  verified: "border-accent/40 bg-accent/10 text-accent",
  following: "border-accent/40 bg-accent/10 text-accent",
  losing: "border-loss/40 bg-loss/10 text-loss",
  killed: "border-border bg-surface-2 text-muted",
  pending: "border-warn/40 bg-warn/10 text-warn",
  buy: "border-accent/40 bg-accent/10 text-accent",
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
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide ${VARIANTS[variant]}`}
    >
      {children}
    </span>
  );
}
