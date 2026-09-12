import { fixtureAgents, type FixtureAgent } from "@/lib/fixtures";

/**
 * TODO(Day 15+, per PRD §5.3): replace the fixture read below with a
 * client-side aggregation over raw TrackRecord + CopyVault events — never a
 * hardcoded array — so Red's −11.7% stays live and undeniable rather than a
 * value someone forgot to update.
 */
export function useLeaderboard(): { agents: FixtureAgent[] } {
  return { agents: fixtureAgents };
}
