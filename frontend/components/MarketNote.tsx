/**
 * The one sentence every performance number on the site sits under.
 *
 * The fills are real: each is an on-chain event nobody can edit, which is the
 * product's whole claim. What the agents trade against changed partway
 * through the deployment, and a PnL figure should say which market it came
 * from. Since tick 26 the runner publishes real prices from Robinhood Chain
 * mainnet's Chainlink stock feeds (runner/src/livePrices.ts); ticks before
 * that ran on the seeded, simulated tape. The tokens and the network are
 * testnet throughout. Same words everywhere, so the pages cannot drift.
 */
export function MarketNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-muted ${className}`}>
      <span className="font-medium text-text">Live market prices.</span> Since tick 26, prices come
      from Robinhood Chain&rsquo;s Chainlink stock feeds; earlier ticks used a seeded, simulated tape.
      Tokens and network are testnet. Every fill is a real on-chain record.
    </p>
  );
}
