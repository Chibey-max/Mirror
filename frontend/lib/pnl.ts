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
  /** When the fill happened — optional because the small sparklines never
   *  needed it; the ranged chart does, to filter by 1D/7D/30D. */
  timestampSeconds?: number;
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
 * Realised PnL% after each trade, oldest first — what the sparkline draws.
 *
 * Recomputed from scratch at each prefix rather than tracked incrementally,
 * because `computeAgentPnl` is already the single source of truth for the
 * number and a second, hand-rolled running total is exactly how the two
 * would drift apart. Trades are assumed to be one agent's own, in order;
 * `useAgents` builds them that way already.
 */
export function pnlPctSeries(trades: MirroredTrade[]): number[] {
  if (trades.length === 0) return [0];
  const agentId = trades[0].agentId;
  const series = [0];
  for (let i = 1; i <= trades.length; i++) {
    series.push(computeAgentPnl(trades.slice(0, i)).get(agentId)?.pnlPct ?? 0);
  }
  return series;
}

/** One point on the ranged PnL chart: realised PnL% as of this moment. */
export type TimedPnlPoint = { timestampSeconds: number; pnlPct: number };

/**
 * The same realised-PnL walk as `pnlPctSeries`, keeping each point's
 * timestamp instead of discarding it — what the agent-detail chart's range
 * pills filter against. Trades missing a `timestampSeconds` are skipped
 * rather than plotted at a guessed position; a point with no real time
 * would make 1D/7D/30D filtering silently wrong instead of just sparser.
 */
export function pnlPctSeriesTimed(trades: MirroredTrade[]): TimedPnlPoint[] {
  const timed = trades.filter(
    (t): t is MirroredTrade & { timestampSeconds: number } =>
      typeof t.timestampSeconds === "number",
  );
  if (timed.length === 0) return [];
  const agentId = timed[0].agentId;
  const points: TimedPnlPoint[] = [];
  for (let i = 1; i <= timed.length; i++) {
    const pnlPct = computeAgentPnl(timed.slice(0, i)).get(agentId)?.pnlPct ?? 0;
    points.push({ timestampSeconds: timed[i - 1].timestampSeconds, pnlPct });
  }
  return points;
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
    .sort((a, b) => a.sequence - b.sequence)
    .map((fill) => ({
      agentId: fill.agentId,
      token: fill.token,
      isBuy: fill.side === "BUY",
      size: Number(fill.size),
      price: Number(fill.price),
    }));
}
