"use client";

import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LedgerStats } from "@/components/LedgerStats";
import { MetalButton } from "@/components/MetalButton";
import { PageHeader } from "@/components/PageHeader";
import { PageAtmosphere } from "@/components/PageAtmosphere";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { useLeaderboard } from "@/hooks/useLeaderboard";

export default function LeaderboardPage() {
  const { agents } = useLeaderboard();
  const winners = agents.filter((a) => a.pnlPct >= 0).length;

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

        <div className="mt-8">
          <LeaderboardTable agents={agents} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
