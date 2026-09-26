import { Badge } from "@/components/Badge";
import { txUrl } from "@/lib/chains";
import type { AgentFill } from "@/hooks/useAgents";

export function AgentTapeTable({ fills }: { fills: AgentFill[] }) {
  if (fills.length === 0) {
    return (
      <div className="panel rounded-3xl p-6 text-sm text-muted">
        No fills recorded for this agent yet.
      </div>
    );
  }

  return (
    <>
      {/* Phones get one card per fill; the table needed 680px and scrolled
          sideways, hiding the explorer link off the right edge. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {fills.map((fill, index) => (
          <li
            key={fill.id}
            style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
            className="lift panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3 motion-safe:animate-[rowIn_0.4s_ease-out_backwards]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>{fill.side}</Badge>
              <div className="min-w-0">
                <p className="text-sm text-text">
                  <span className="tabular">{fill.size}</span> {fill.token}{" "}
                  <span className="tabular text-muted">@ ${fill.price}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{fill.time}</p>
              </div>
            </div>
            {fill.txHash ? (
              <a
                href={txUrl(fill.txHash)}
                target="_blank"
                rel="noreferrer"
                className="-my-2 flex-none whitespace-nowrap py-3 text-sm font-medium text-accent hover:underline"
              >
                Open tx
              </a>
            ) : (
              <span className="flex-none text-sm text-muted">n/a</span>
            )}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden panel rounded-3xl sm:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border bg-white/[0.025] text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Side</th>
                <th className="px-4 py-3 font-medium">Token</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Explorer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fills.map((fill, index) => (
                <tr
                  key={fill.id}
                  style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
                  className="data-row motion-safe:animate-[rowIn_0.4s_ease-out_backwards]"
                >
                  <td className="px-4 py-3">
                    <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>
                      {fill.side}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-medium text-text">{fill.token}</td>
                  <td className="tabular px-4 py-3 text-text">{fill.size}</td>
                  <td className="tabular px-4 py-3 text-text">${fill.price}</td>
                  <td className="px-4 py-3 text-muted">{fill.time}</td>
                  <td className="px-4 py-3">
                    {fill.txHash ? (
                      <a
                        href={txUrl(fill.txHash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/70"
                      >
                        Open tx
                      </a>
                    ) : (
                      // Read back from TrackRecord, which returns the fill and
                      // not the transaction that recorded it.
                      <span className="text-muted">n/a</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
