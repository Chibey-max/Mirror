import { Badge } from "@/components/Badge";
import { Sparkline } from "@/components/Sparkline";
import type { FixtureAgent } from "@/lib/fixtures";

/**
 * Leaderboard (design prompt §12): "Computed live from on-chain TrackRecord
 * and CopyVault events. No spreadsheets." Red sits visibly in the red,
 * don't soften it, that honesty is the whole point (PRD §11).
 *
 * `agents` comes from hooks/useLeaderboard, which aggregates PnL
 * client-side from TrackRecord and CopyVault, never from a hardcoded array.
 */
export function LeaderboardTable({ agents }: { agents: FixtureAgent[] }) {
  const ranked = [...agents].sort((a, b) => b.pnlPct - a.pnlPct);

  if (ranked.length === 0) {
    return (
      <div className="panel rounded-3xl p-6 text-center">
        <p className="text-sm text-muted">
          No agents registered yet. Once AgentRegistry has an entry, it
          ranks here. Nothing is seeded by hand.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Computed live from on-chain TrackRecord and CopyVault events. No
        spreadsheets.
      </p>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto panel rounded-3xl sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Trend</th>
              <th className="px-4 py-3 font-medium">PnL %</th>
              <th className="px-4 py-3 font-medium">PnL USDG</th>
              <th className="px-4 py-3 font-medium">Fills</th>
              <th className="px-4 py-3 font-medium">Followers</th>
              <th className="px-4 py-3 font-medium">Mirrored vol</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((agent, i) => (
              <tr
                key={agent.id}
                style={{ animationDelay: `${i * 60}ms` }}
                className="motion-reduce:animate-none animate-[rowIn_0.4s_ease-out_backwards] data-row group border-b border-border last:border-0"
              >
                <td className="px-4 py-3 tabular text-muted">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{agent.name}</span>
                    {agent.isLosing && <Badge variant="losing">Losing agent</Badge>}
                  </div>
                  <span className="text-xs text-muted">{agent.strategy}</span>
                </td>
                <td className="px-4 py-3">
                  <Sparkline
                    id={`board-rank-${agent.id}`}
                    series={agent.pnlSeries}
                    width={88}
                    height={28}
                  />
                </td>
                <td
                  className={`tabular px-4 py-3 font-semibold ${agent.pnlPct >= 0 ? "text-profit" : "text-loss"}`}
                >
                  {agent.pnlPct >= 0 ? "+" : ""}
                  {agent.pnlPct.toFixed(1)}%
                </td>
                <td className="tabular px-4 py-3 text-muted">
                  {agent.pnlUsd >= 0 ? "+" : ""}
                  {agent.pnlUsd.toFixed(2)} USDG
                </td>
                <td className="tabular px-4 py-3 text-muted">{agent.fills}</td>
                <td className="tabular px-4 py-3 text-muted">{agent.followers}</td>
                <td className="tabular px-4 py-3 text-muted">
                  ${agent.volumeUsd.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-2 sm:hidden">
        {ranked.map((agent, i) => (
          <div
            key={agent.id}
            style={{ animationDelay: `${i * 60}ms` }}
            className="motion-reduce:animate-none animate-[rowIn_0.4s_ease-out_backwards] group lift panel rounded-2xl p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="tabular text-muted">#{i + 1}</span>
                <span className="font-medium text-text">{agent.name}</span>
                {agent.isLosing && <Badge variant="losing">Losing agent</Badge>}
              </div>
              <span
                className={`tabular font-semibold ${agent.pnlPct >= 0 ? "text-profit" : "text-loss"}`}
              >
                {agent.pnlPct >= 0 ? "+" : ""}
                {agent.pnlPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <p className="text-xs text-muted">
                {agent.strategy} · {agent.fills} fills · {agent.followers}{" "}
                followers · ${agent.volumeUsd.toLocaleString()} vol
              </p>
              <Sparkline
                id={`board-rank-mobile-${agent.id}`}
                series={agent.pnlSeries}
                width={72}
                height={24}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
