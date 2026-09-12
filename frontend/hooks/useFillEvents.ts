import { fixtureFills, type FixtureFill } from "@/lib/fixtures";

/**
 * Fills for one agent (or all, if agentId is omitted), newest first.
 *
 * TODO(Day 9+, once Jason's Runner produces real fills and addresses land in
 * lib/contracts.ts): replace the fixture read below with wagmi's
 * useWatchContractEvent on CopyVault's Mirrored event, keyed by agentId, so
 * a fill hits this hook — and therefore the FillFeed and vault balance —
 * live, off the chain itself, never off a client-side timer.
 */
export function useFillEvents(agentId?: number): { fills: FixtureFill[] } {
  const fills = agentId
    ? fixtureFills.filter((f) => f.agentId === agentId)
    : fixtureFills;

  return { fills };
}
