/**
 * The one sentence every performance number on the site sits under.
 *
 * The fills are real: each is an on-chain event nobody can edit, and that is
 * the product's whole claim. The market they traded in is not: prices come
 * from a seeded, simulated tape driving mock oracles on testnet. A PnL figure
 * shown without saying so would imply a real market and borrow credibility
 * the ledger doesn't need, so the distinction is stated wherever performance
 * is, in the same words everywhere.
 */
export function SimulatedMarketNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      <span className="font-medium text-text">Simulated market.</span> Prices come from a seeded,
      simulated tape feeding mock oracles on testnet. Every fill is a real on-chain record; the market
      it traded in is not.
    </p>
  );
}
