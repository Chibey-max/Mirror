import { fixtureAgents, fixtureFills, type FixtureAgent } from "@/lib/fixtures";
import { computeAgentPnl, tradesFromFills } from "@/lib/pnl";

/**
 * The leaderboard, ranked on PnL computed from what was mirrored — never from
 * `allocationOf`, which is principal committed and returned unchanged at
 * unfollow (PRD v2.2 §7.3/§10). Reading that as value would put every agent
 * at exactly break-even.
 *
 * The computation is in lib/pnl.ts and is the path that ships. It takes over
 * per agent as soon as the tape closes a position; where nothing has been
 * closed there is no realised PnL to show, and the agent keeps its sample
 * figure rather than dropping to a misleading 0.0%. With today's fixture tape
 * that means all three still show their sample numbers — it has three fills
 * and no round trips.
 *
 * TODO(Day 12+, once CopyVault emits Mirrored): feed `computeAgentPnl` the
 * connected wallet's Mirrored logs joined to each fill's recorded price
 * instead of `tradesFromFills`, which assumes an uncapped follower and is
 * therefore the upper bound, not the real series.
 */
export function useLeaderboard(): { agents: FixtureAgent[] } {
  const computed = computeAgentPnl(tradesFromFills(fixtureFills));

  const agents = fixtureAgents.map((agent) => {
    const pnl = computed.get(agent.id);
    if (!pnl || pnl.closedCost <= 0) return agent;
    return { ...agent, pnlUsd: pnl.pnlUsd, pnlPct: pnl.pnlPct };
  });

  return { agents };
}
