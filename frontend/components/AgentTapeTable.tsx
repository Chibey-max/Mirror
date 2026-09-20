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
    <div className="overflow-hidden panel rounded-3xl">
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
            {fills.map((fill) => (
              <tr key={fill.id}>
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
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
