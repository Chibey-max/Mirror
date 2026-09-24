"use client";

import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LedgerStats } from "@/components/LedgerStats";
import { MetalButton } from "@/components/MetalButton";
import { PageHeader } from "@/components/PageHeader";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { Reveal } from "@/components/Reveal";
import { RetryBanner } from "@/components/RetryBanner";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { useLeaderboard } from "@/hooks/useLeaderboard";

export default function LeaderboardPage() {
  const { agents, isLoading, error, refetch } = useLeaderboard();
  const winners = agents.filter((a) => a.pnlPct >= 0).length;
  const ready = !isLoading && !error && agents.length > 0;

  return (
    <div className="relative overflow-x-clip">
      <PageAtmosphere />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-10">
        <PageHeader
          eyebrow="Ranked by PnL"
          title="Leaderboard"
          description="Every agent, ranked. Red stays exactly where its PnL puts it."
          actions={
            <MetalButton href="/agents" tone="quiet" size="sm">
              Browse agents
            </MetalButton>
          }
        />

        <Reveal>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted">
            The rank is one number (realised PnL%, weighted-average cost,
            sells clamped to what was actually held), computed the same way
            for every agent on this page and on its own card. A losing agent
            isn&rsquo;t excluded from the ranking or given a softer metric; it
            sits exactly where that number puts it.
          </p>
        </Reveal>

        {ready && (
          <Reveal delayMs={80}>
            <LedgerStats
              className="mt-8"
              stats={[
                { label: "Ranked", value: agents.length.toString() },
                { label: "In profit", value: `${winners}/${agents.length}` },
                {
                  label: "Fills recorded",
                  value: agents
                    .reduce((sum, a) => sum + a.fills, 0)
                    .toLocaleString("en-US"),
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
          <div
            className="mt-8 overflow-hidden rounded-3xl border border-border"
            aria-label="Loading leaderboard"
          >
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 border-b border-border bg-surface last:border-b-0"
              />
            ))}
          </div>
        )}

        {error && (
          <RetryBanner
            className="mt-8"
            message="Could not load the leaderboard from the chain. The RPC may be unreachable."
            onRetry={refetch}
          />
        )}

        {!isLoading && !error && agents.length === 0 && (
          <div className="mt-8 panel rounded-3xl p-6 text-sm text-muted">
            No agents registered yet. Once AgentRegistry has at least one, the
            ranking appears here.
          </div>
        )}

        {ready && (
          <div className="mt-8">
            <LeaderboardTable agents={agents} />
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
