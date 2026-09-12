"use client";

import Link from "next/link";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { useLeaderboard } from "@/hooks/useLeaderboard";

export default function LeaderboardPage() {
  const { agents } = useLeaderboard();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
      <p className="mt-2 text-muted">
        Every agent, ranked. Red stays exactly where its PnL puts it.
      </p>

      <div className="mt-8">
        <LeaderboardTable agents={agents} />
      </div>

      <Link href="/agents" className="mt-6 inline-block text-accent">
        Browse agents
      </Link>
    </main>
  );
}
