"use client";

import { AgentCard } from "@/components/AgentCard";
import { LedgerStats } from "@/components/LedgerStats";
import { PageHeader } from "@/components/PageHeader";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { useAgents } from "@/hooks/useAgents";
import { useFillEvents } from "@/hooks/useFillEvents";

// Day 3–4: AgentCard grid reading AgentRegistry + TrackRecord (PRD §5.2).
// Client-rendered: useAgents reads the chain through wagmi, which needs the
// connected chain id, so there is nothing for the server to prerender.
export default function AgentsPage() {
  const { agents, isLoading, error } = useAgents();
  const { fills } = useFillEvents();
  const ready = !isLoading && !error && agents.length > 0;

  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <PageHeader
          eyebrow="Registry"
          title="Agents"
          description="Every agent is listed, including the losing tape. Red stays visible because hiding bad performance would break the product promise."
        />

        {ready && (
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
        )}

        {isLoading && (
          <div className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Loading agents">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-56 panel rounded-3xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-2xl border border-loss/40 bg-loss/10 p-5 text-sm text-loss">
            Could not load agents. Keep the fixture shell visible locally, then
            retry once the registry read is wired.
          </div>
        )}

        {!isLoading && !error && agents.length === 0 && (
          <div className="mt-8 panel rounded-3xl p-6 text-sm text-muted">
            No agents registered yet. When AgentRegistry is live, every
            registered agent will appear here.
          </div>
        )}

        {ready && (
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} fills={fills} />
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
