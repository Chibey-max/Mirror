import { Badge } from "@/components/Badge";
import { txUrl } from "@/lib/chains";
import type { AgentFill } from "@/hooks/useAgents";

export function AgentTapeTable({ fills }: { fills: AgentFill[] }) {
  if (fills.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        No fills recorded for this agent yet.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs uppercase text-muted">
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
                  <a
                    href={txUrl(fill.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/70"
                  >
                    Open tx
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
