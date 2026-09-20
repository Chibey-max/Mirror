"use client";

import Link from "next/link";
import { AgentCard } from "@/components/AgentCard";
import { useAgents } from "@/hooks/useAgents";

// Day 3–4: AgentCard grid reading AgentRegistry + TrackRecord (PRD §5.2).
// Client-rendered: useAgents reads the chain through wagmi, which needs the
// connected chain id, so there is nothing for the server to prerender.
export default function AgentsPage() {
  const { agents, isLoading, error } = useAgents();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Every agent is listed, including the losing tape. Red stays visible
            because hiding bad performance would break the product promise.
          </p>
        </div>
        <Link href="/" className="text-sm font-medium text-accent hover:underline">
          Back
        </Link>
      </div>

      {isLoading && (
        <div className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Loading agents">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-56 rounded-2xl border border-border bg-surface"
            />
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
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
          No agents registered yet. When AgentRegistry is live, every registered
          agent will appear here.
        </div>
      )}

      {!isLoading && !error && agents.length > 0 && (
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}

      <Link href="/" className="mt-8 inline-block text-accent md:hidden">
        Back
      </Link>
    </main>
  );
}
