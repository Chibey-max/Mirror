"use client";

import { Badge } from "@/components/Badge";
import { reasonClause } from "@/components/FillFeed";
import type { MirrorRow } from "@/hooks/useMyMirrors";
import { txUrl } from "@/lib/chains";

/**
 * "Your mirrors" (briefing §09.C): the personal view of the public log,
 * every fill from every agent you follow, each carrying whatever happened
 * to YOUR vault, not the agent's own trade outcome.
 *
 * "Neither" (no Mirrored, no MirrorRejected) is not a rejection, it means
 * you weren't following yet, or a sell clamped to zero held (§7.2), and
 * gets the exact label the briefing specifies, never "blocked".
 */
export function YourMirrors({ rows }: { rows: MirrorRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="panel rounded-3xl p-6 text-sm text-muted">
        Follow an agent and every mirror into your vault will land here,
        including the ones PolicyModule refuses.
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto panel rounded-3xl sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Trade</th>
              <th className="px-4 py-3 font-medium">Outcome</th>
              <th className="px-4 py-3 font-medium">Explorer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td
                  className="px-4 py-3 text-xs text-muted"
                  title={row.timeAbsolute}
                >
                  {row.time}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/agents/${row.agentId}`}
                    className="font-medium text-text hover:text-accent"
                  >
                    {row.agentName}
                  </a>
                </td>
                <td className="tabular px-4 py-3">
                  <Badge variant={row.side === "BUY" ? "buy" : "sell"}>
                    {row.side}
                  </Badge>{" "}
                  {row.size} {row.token}{" "}
                  <span className="text-muted">@ ${row.price}</span>
                </td>
                <td className="px-4 py-3">
                  <MirrorOutcomeCell row={row} />
                </td>
                <td className="px-4 py-3">
                  {row.outcome?.status !== "skipped" && row.outcome?.txHash ? (
                    <a
                      href={txUrl(row.outcome.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline"
                    >
                      Open tx
                    </a>
                  ) : (
                    <span className="text-muted">n/a</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <li key={row.id} className="panel rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3">
              <a
                href={`/agents/${row.agentId}`}
                className="font-medium text-text hover:text-accent"
              >
                {row.agentName}
              </a>
              <span className="text-xs text-muted" title={row.timeAbsolute}>
                {row.time}
              </span>
            </div>
            <p className="tabular mt-1.5 text-sm">
              <Badge variant={row.side === "BUY" ? "buy" : "sell"}>
                {row.side}
              </Badge>{" "}
              {row.size} {row.token}{" "}
              <span className="text-muted">@ ${row.price}</span>
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <MirrorOutcomeCell row={row} />
              {row.outcome?.status !== "skipped" && row.outcome?.txHash && (
                <a
                  href={txUrl(row.outcome.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent hover:underline"
                >
                  Open tx
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function MirrorOutcomeCell({ row }: { row: MirrorRow }) {
  if (row.outcome?.status === "mirrored") {
    return <span className="text-profit">Mirrored</span>;
  }
  if (row.outcome?.status === "rejected") {
    return (
      <div>
        <span className="text-loss">Blocked</span>
        <p className="mt-0.5 text-xs text-loss/80">
          {reasonClause(row.outcome.reason)}
        </p>
      </div>
    );
  }
  // Neither Mirrored nor MirrorRejected: weren't following yet, or a sell
  // clamped to zero held (§7.2). Not a rejection, never "blocked".
  return <span className="text-muted">Not mirrored, nothing held</span>;
}
