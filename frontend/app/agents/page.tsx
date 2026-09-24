"use client";

import { useState } from "react";
import { AgentCard } from "@/components/AgentCard";
import { LedgerStats } from "@/components/LedgerStats";
import { PageHeader } from "@/components/PageHeader";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { Reveal } from "@/components/Reveal";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { RetryBanner } from "@/components/RetryBanner";
import { useAgents } from "@/hooks/useAgents";
import { useFillEvents } from "@/hooks/useFillEvents";
import type { Agent } from "@/hooks/useAgents";

type SortKey = "pnl" | "fills" | "newest";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "pnl", label: "PnL" },
  { key: "fills", label: "Fills" },
  { key: "newest", label: "Newest" },
];

function sortAgents(agents: Agent[], key: SortKey): Agent[] {
  const sorted = [...agents];
  if (key === "pnl") return sorted.sort((a, b) => b.pnlPct - a.pnlPct);
  if (key === "fills") return sorted.sort((a, b) => b.fills - a.fills);
  // "Newest": registeredAt is an ISO date string, so lexical order is
  // chronological order, no Date parsing needed.
  return sorted.sort((a, b) => (a.registeredAt < b.registeredAt ? 1 : -1));
}

// Day 3–4: AgentCard grid reading AgentRegistry + TrackRecord (PRD §5.2).
// Client-rendered: useAgents reads the chain through wagmi, which needs the
// connected chain id, so there is nothing for the server to prerender.
export default function AgentsPage() {
  const { agents, isLoading, error, refetch } = useAgents();
  const { fills } = useFillEvents();
  const [sort, setSort] = useState<SortKey>("pnl");
  const ready = !isLoading && !error && agents.length > 0;
  const sorted = sortAgents(agents, sort);

  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="outline-none mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <PageHeader
          eyebrow="Registry"
          title="Agents"
          description="Every agent is listed, including the losing tape. Red stays visible because hiding bad performance would break the product promise."
        />

        {/*
          The two badges AgentCard can show, explained once here rather than
          left for a visitor to infer, the trust claim only lands if the
          reader knows what "Verified" is actually checking.
        */}
        <Reveal>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
            <span className="font-medium text-chrome">Verified</span> means
            every fill on that agent&rsquo;s tape traces to an on-chain event,
            not that it&rsquo;s winning.{" "}
            <span className="font-medium text-loss">Losing agent</span> is the
            same ledger saying so plainly: a negative PnL is exactly as
            verifiable as a positive one, and hiding it would defeat the
            point.
          </p>
        </Reveal>

        {ready && (
          <Reveal delayMs={80}>
            <LedgerStats
              className="mt-8"
              stats={[
                { label: "Agents live", value: agents.length.toString() },
                {
                  label: "Fills recorded",
                  value: agents
                    .reduce((sum, a) => sum + a.fills, 0)
                    .toLocaleString("en-US"),
                },
                {
                  label: "Followers protected",
                  value: agents
                    .reduce((sum, a) => sum + a.followers, 0)
                    .toString(),
                },
                {
                  label: "Mirrored volume",
                  value: `$${agents
                    .reduce((sum, a) => sum + a.volumeUsd, 0)
                    .toLocaleString("en-US")}`,
                },
              ]}
            />
          </Reveal>
        )}

        {isLoading && (
          <div className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Loading agents">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-56 panel rounded-3xl" />
            ))}
          </div>
        )}

        {error && (
          <RetryBanner
            className="mt-8"
            message="Could not load agents from the chain. The RPC may be unreachable."
            onRetry={refetch}
          />
        )}

        {!isLoading && !error && agents.length === 0 && (
          <div className="mt-8 panel rounded-3xl p-6 text-sm text-muted">
            No agents registered yet. When AgentRegistry is live, every
            registered agent will appear here.
          </div>
        )}

        {ready && (
          <>
            <div
              role="group"
              aria-label="Sort agents"
              className="mt-8 flex items-center gap-2"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                Sort
              </span>
              {SORTS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sort === key}
                  onClick={() => setSort(key)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    sort === key
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {sorted.map((agent, index) => (
                <Reveal key={agent.id} delayMs={index * 60}>
                  <AgentCard agent={agent} fills={fills} />
                </Reveal>
              ))}
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
