import Link from "next/link";
import { Badge } from "@/components/Badge";
import { CopyableHash } from "@/components/Copyable";
import { Sparkline } from "@/components/Sparkline";
import { lastAction, tokensTraded } from "@/lib/agentActivity";
import type { Agent } from "@/hooks/useAgents";
import type { FixtureFill } from "@/lib/fixtures";

export function AgentCard({
  agent,
  fills = [],
}: {
  agent: Agent;
  /** The agent's tape, for the tokens it trades and its latest fill. */
  fills?: FixtureFill[];
}) {
  const tokens = tokensTraded(fills, agent.id);
  const latest = lastAction(fills, agent.id);

  return (
    <Link
      href={`/agents/${agent.id}`}
      className="group block panel transition-colors hover:border-chrome-dim rounded-3xl p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-text">
            {agent.name}
          </h2>
          <p className="mt-1 text-sm text-muted">{agent.strategy}</p>
          {tokens.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tokens.map((token) => (
                <span
                  key={token}
                  className="tabular rounded-full border border-border px-2 py-0.5 text-[11px] text-muted"
                >
                  {token}
                </span>
              ))}
            </div>
          )}
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
              agent.pnlPct < 0 ? "text-loss" : "text-profit"
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

      <div className="mt-4 flex items-end justify-between gap-3">
        <Sparkline id={`card-${agent.id}`} series={agent.pnlSeries} width={112} height={32} />
        {latest && (
          <p className="min-w-0 truncate text-right text-xs text-muted">
            <span
              className={
                latest.side === "BUY"
                  ? "font-semibold text-profit"
                  : "font-semibold text-loss"
              }
            >
              {latest.side}
            </span>{" "}
            <span className="tabular">
              {latest.size} {latest.token}
            </span>{" "}
            &middot; {latest.time}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        {/*
          The card itself is a Link — a button nested in an anchor is
          invalid content, and without stopping the click it would copy the
          hash AND navigate. Stopped here, not inside CopyableHash itself,
          since that's a fact about this one placement, not about copying.
        */}
        <span
          onClick={(event) => event.stopPropagation()}
          className="min-w-0 font-mono text-xs text-muted"
        >
          <CopyableHash value={agent.strategyHash} label="Copy the full strategy hash" />
        </span>
        <span className="text-sm font-medium text-accent group-hover:underline">
          View tape
        </span>
      </div>
    </Link>
  );
}
