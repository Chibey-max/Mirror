"use client";

import { fixtureAgents, fixtureFills, type FixtureAgent } from "@/lib/fixtures";
import { computeAgentPnl, tradesFromFills } from "@/lib/pnl";
import { useAgents } from "@/hooks/useAgents";

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
 * that means all three still show their sample numbers: every sell in it is
 * against a token that agent never bought, so nothing has closed.
 *
 * Live, the agents already carry PnL computed from their own TrackRecord
 * fills — useAgents runs the same function — so this hands them through
 * untouched rather than computing a second, differently-sourced number for
 * the same agent.
 *
 * TODO(once CopyVault emits Mirrored): the tape is every agent's own fills,
 * which is the upper bound for a follower — the real per-follower series is
 * smaller wherever a cap clipped one. Joining Mirrored logs to each fill's
 * recorded price gives the figure a follower actually earned.
 */
export function useLeaderboard(): { agents: FixtureAgent[] } {
  const { agents: live } = useAgents();
  if (live !== fixtureAgents) return { agents: live };

  const computed = computeAgentPnl(tradesFromFills(fixtureFills));

  const agents = fixtureAgents.map((agent) => {
    const pnl = computed.get(agent.id);
    if (!pnl || pnl.closedCost <= 0) return agent;
    return { ...agent, pnlUsd: pnl.pnlUsd, pnlPct: pnl.pnlPct };
  });

  return { agents };
}
