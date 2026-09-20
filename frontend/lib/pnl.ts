import type { FixtureFill } from "@/lib/fixtures";

/**
 * Leaderboard PnL, computed client-side.
 *
 * PRD v2.2 §7.3/§10 is explicit about where this may NOT come from:
 * `allocationOf` is principal committed and returned unchanged at unfollow,
 * so reading it as value would show every agent at exactly break-even.
 * Mirror never settles anything either, so there is no mark-to-market — the
 * only honest number is realised PnL from what was actually mirrored, priced
 * at each fill.
 *
 * Positions are tracked in token units with a weighted-average cost, the same
 * shape the vault keeps (§7.2), and sells clamp to what is held: an agent
 * that sells more than it bought closes its position, it doesn't go short.
 */
export type MirroredTrade = {
  agentId: number;
  token: string;
  isBuy: boolean;
  /** Token units actually mirrored — Mirrored.size, not the agent's own fill. */
  size: number;
  /** The fill's recorded price, USDG per token unit. */
  price: number;
};

export type AgentPnl = {
  /** Realised only: closed positions, priced at the fills that closed them. */
  pnlUsd: number;
  /** Realised PnL over the cost of what was closed. 0 when nothing closed. */
  pnlPct: number;
  /** Cost basis of the closed portion — the denominator above. */
  closedCost: number;
  /** Cost still on the books, i.e. open exposure. */
  openCost: number;
};

export function computeAgentPnl(
  trades: MirroredTrade[],
): Map<number, AgentPnl> {
  const byAgent = new Map<number, AgentPnl>();
  // agentId -> token -> running position
  const books = new Map<number, Map<string, { size: number; cost: number }>>();

  for (const trade of trades) {
    const book = books.get(trade.agentId) ?? new Map();
    books.set(trade.agentId, book);
    const lot = book.get(trade.token) ?? { size: 0, cost: 0 };
    book.set(trade.token, lot);

    const agent =
      byAgent.get(trade.agentId) ??
      { pnlUsd: 0, pnlPct: 0, closedCost: 0, openCost: 0 };
    byAgent.set(trade.agentId, agent);

    if (trade.isBuy) {
      lot.size += trade.size;
      lot.cost += trade.size * trade.price;
      continue;
    }

    // Sells clamp to what is held (§7.2): nothing held is nothing to mirror.
    const sold = Math.min(trade.size, lot.size);
    if (sold <= 0) continue;
    const averageCost = lot.cost / lot.size;
    const basis = averageCost * sold;

    agent.pnlUsd += sold * trade.price - basis;
    agent.closedCost += basis;
    lot.size -= sold;
    lot.cost -= basis;
  }

  for (const [agentId, book] of books) {
    const agent = byAgent.get(agentId);
    if (!agent) continue;
    agent.openCost = [...book.values()].reduce((sum, lot) => sum + lot.cost, 0);
    agent.pnlPct =
      agent.closedCost > 0 ? (agent.pnlUsd / agent.closedCost) * 100 : 0;
  }

  return byAgent;
}

/**
 * The tape as trades, for a follower whose cap never bit.
 *
 * A stand-in until CopyVault emits Mirrored: the real series is per-follower
 * and smaller wherever a cap clipped a fill, so this is the upper bound, not
 * a substitute.
 */
export function tradesFromFills(fills: FixtureFill[]): MirroredTrade[] {
  return [...fills]
    .sort((a, b) => a.block - b.block)
    .map((fill) => ({
      agentId: fill.agentId,
      token: fill.token,
      isBuy: fill.side === "BUY",
      size: Number(fill.size),
      price: Number(fill.price),
    }));
}
