import Link from "next/link";
import { Badge } from "@/components/Badge";
import { Sparkline } from "@/components/Sparkline";
import { lastAction, tokensTraded } from "@/lib/agentActivity";
import type { FixtureAgent, FixtureFill } from "@/lib/fixtures";

/**
 * One row per agent, answering what a follower actually wants to know before
 * committing money: which Stock Tokens it trades, what it just did, and
 * whether its record is going up or down.
 *
 * Everything here is derived from the same two reads the rest of the app uses
 * — the registry row and the agent's tape — so it stays true when fixtures
 * give way to chain reads.
 */
export function AgentBoard({
  agents,
  fills,
}: {
  agents: FixtureAgent[];
  fills: FixtureFill[];
}) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border">
      {agents.map((agent) => {
        const tokens = tokensTraded(fills, agent.id);
        const latest = lastAction(fills, agent.id);
        const down = agent.pnlPct < 0;

        return (
          <li key={agent.id} className="bg-[#09090a]">
            <Link
              href={`/agents/${agent.id}`}
              className="group grid grid-cols-1 items-center gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] focus:outline-none focus-visible:bg-white/[0.03] sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_auto_auto]"
            >
              {/* Who, and what it trades. */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text">{agent.name}</span>
                  {agent.isLosing ? (
                    <Badge variant="losing">Losing agent</Badge>
                  ) : (
                    <Badge variant="verified">Verified</Badge>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted">{agent.strategy}</span>
                  {tokens.map((token) => (
                    <span
                      key={token}
                      className="tabular rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
                    >
                      {token}
                    </span>
                  ))}
                </div>
              </div>

              {/* What it just did. */}
              <div className="min-w-0 text-[13px]">
                {latest ? (
                  <>
                    <span
                      className={`text-[11px] font-semibold tracking-[0.06em] ${
                        latest.side === "BUY" ? "text-profit" : "text-loss"
                      }`}
                    >
                      {latest.side}
                    </span>{" "}
                    <span className="tabular text-text">
                      {latest.size} {latest.token}
                    </span>{" "}
                    <span className="tabular text-muted">@ ${latest.price}</span>
                    <div className="mt-0.5 text-xs text-muted">
                      {latest.time} &middot; block #
                      {latest.block.toLocaleString("en-US")}
                    </div>
                  </>
                ) : (
                  <span className="text-muted">No fills yet</span>
                )}
              </div>

              {/* Where the record is heading. */}
              <div className="flex items-center gap-4">
                <Sparkline id={`board-${agent.id}`} series={agent.pnlSeries} />
                <div className="text-right">
                  <div
                    className={`tabular font-semibold ${down ? "text-loss" : "text-profit"}`}
                  >
                    {agent.pnlPct > 0 ? "+" : ""}
                    {agent.pnlPct.toFixed(1)}%
                  </div>
                  <div className="tabular text-xs text-muted">
                    {agent.pnlUsd > 0 ? "+" : ""}
                    {agent.pnlUsd.toFixed(2)} USDG
                  </div>
                </div>
              </div>

              {/* Scale: how many people this is protecting, and how much. */}
              <dl className="flex gap-6 sm:gap-8">
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    Followers
                  </dt>
                  <dd className="tabular mt-0.5 text-sm">{agent.followers}</dd>
                </div>
                <div>
                  <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                    Mirrored
                  </dt>
                  <dd className="tabular mt-0.5 text-sm">
                    ${agent.volumeUsd.toLocaleString("en-US")}
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
