import Link from "next/link";
import { Badge } from "@/components/Badge";
import type { Agent } from "@/hooks/useAgents";

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group block rounded-2xl border border-border bg-surface p-5 transition hover:border-accent/50 hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-accent/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text">
            {agent.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{agent.strategy}</p>
        </div>
        {agent.isLosing ? (
          <Badge variant="losing">Losing agent</Badge>
        ) : (
          <Badge variant="verified">Verified</Badge>
        )}
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-muted">Fills</dt>
          <dd className="tabular mt-1 font-semibold text-text">{agent.fills}</dd>
        </div>
        <div>
          <dt className="text-muted">PnL</dt>
          <dd
            className={`tabular mt-1 font-semibold ${
              agent.pnlPct < 0 ? "text-loss" : "text-accent"
            }`}
          >
            {agent.pnlPct > 0 ? "+" : ""}
            {agent.pnlPct.toFixed(1)}%
          </dd>
        </div>
        <div>
          <dt className="text-muted">Followers</dt>
          <dd className="tabular mt-1 font-semibold text-text">
            {agent.followers}
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="min-w-0 truncate font-mono text-xs text-muted">
          {shortHash(agent.strategyHash)}
        </span>
        <span className="text-sm font-medium text-accent group-hover:underline">
          View tape
        </span>
      </div>
    </Link>
  );
}
