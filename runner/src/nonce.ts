/**
 * The nonce to sign with.
 *
 * The public RPC is load-balanced, and a node that has not yet imported the
 * runner's last transaction reports a nonce it has already used. At 16:15 UTC
 * on 1 Oct that is what happened: nonce 410 mined at 16:15:32, the next write
 * was signed seconds later with a used nonce, the node answered "nonce too
 * low" to every rebroadcast, and the agents stopped for five hours.
 *
 * The runner is the only sender for its key (CI is the only runner, and the
 * CLI refuses to run locally), so its journal is authoritative about what it
 * has mined. The nonce is never lower than one past the highest mined nonce,
 * whatever a lagging node says. It is never higher than the chain's own
 * count either, unless the chain is behind the journal, so it cannot open a
 * gap: a mined nonce is always below the chain's true next one.
 */
export function nextNonce(chainPending: number, highestMined: number | undefined): number {
  return highestMined === undefined ? chainPending : Math.max(chainPending, highestMined + 1);
}
