import type { FixtureFill } from "@/lib/fixtures";

/**
 * Small derivations over an agent's tape, shared by the agent cards and the
 * landing page's board so both answer the same two questions the same way:
 * which Stock Tokens is this agent trading, and what did it just do.
 *
 * Derived, never stored: the tape is the source of truth (PRD §4.2), so these
 * keep working unchanged when useFillEvents starts returning real
 * FillRecorded logs instead of fixtures.
 */

/** Distinct tokens an agent has traded, most recently traded first. */
export function tokensTraded(fills: FixtureFill[], agentId: number): string[] {
  const seen: string[] = [];
  for (const fill of byAgentNewestFirst(fills, agentId)) {
    if (!seen.includes(fill.token)) seen.push(fill.token);
  }
  return seen;
}

/** The agent's most recent fill, or undefined if it hasn't traded yet. */
export function lastAction(
  fills: FixtureFill[],
  agentId: number,
): FixtureFill | undefined {
  return byAgentNewestFirst(fills, agentId)[0];
}

/** Newest first by block, `time` is a display string, not sortable. */
function byAgentNewestFirst(fills: FixtureFill[], agentId: number) {
  return fills
    .filter((fill) => fill.agentId === agentId)
    .sort((a, b) => b.sequence - a.sequence);
}
