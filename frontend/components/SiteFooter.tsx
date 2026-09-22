/**
 * The one footer, on every screen, the trust line from the landing page
 * (design prompt §1), generalised so an inner page carries the same
 * "verify this yourself" claim the hero makes.
 */
export function SiteFooter({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="px-5 pb-8 pt-4 sm:px-10">
      <div
        className={`mx-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted ${
          wide ? "max-w-7xl" : "max-w-6xl"
        }`}
      >
        <span>Deployed on Robinhood Chain testnet &middot; chain 46630</span>
        <span>Contracts verified &middot; open source</span>
      </div>
    </footer>
  );
}
