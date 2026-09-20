import { Badge } from "@/components/Badge";
import type { FixtureAgent } from "@/lib/fixtures";

/**
 * Leaderboard (design prompt §12): "Computed live from on-chain TrackRecord
 * and CopyVault events. No spreadsheets." Red sits visibly in the red —
 * don't soften it, that honesty is the whole point (PRD §11).
 *
 * `agents` comes from hooks/useLeaderboard, which aggregates PnL
 * client-side from TrackRecord and CopyVault, never from a hardcoded array.
 */
export function LeaderboardTable({ agents }: { agents: FixtureAgent[] }) {
  const ranked = [...agents].sort((a, b) => b.pnlPct - a.pnlPct);

  if (ranked.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">
          No agents registered yet. Once AgentRegistry has an entry, it
          ranks here — nothing is seeded by hand.
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
      <div className="hidden overflow-x-auto rounded-2xl border border-border sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">PnL %</th>
              <th className="px-4 py-3 font-medium">PnL USDG</th>
              <th className="px-4 py-3 font-medium">Fills</th>
              <th className="px-4 py-3 font-medium">Followers</th>
              <th className="px-4 py-3 font-medium">Mirrored vol</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((agent, i) => (
              <tr key={agent.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 tabular text-muted">{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{agent.name}</span>
                    {agent.isLosing && <Badge variant="losing">Losing agent</Badge>}
                  </div>
                  <span className="text-xs text-muted">{agent.strategy}</span>
                </td>
                <td
                  className={`tabular px-4 py-3 font-semibold ${agent.pnlPct >= 0 ? "text-accent" : "text-loss"}`}
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
          <div key={agent.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="tabular text-muted">#{i + 1}</span>
                <span className="font-medium text-text">{agent.name}</span>
                {agent.isLosing && <Badge variant="losing">Losing agent</Badge>}
              </div>
              <span
                className={`tabular font-semibold ${agent.pnlPct >= 0 ? "text-accent" : "text-loss"}`}
              >
                {agent.pnlPct >= 0 ? "+" : ""}
                {agent.pnlPct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {agent.strategy} · {agent.fills} fills · {agent.followers}{" "}
              followers · ${agent.volumeUsd.toLocaleString()} vol
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
