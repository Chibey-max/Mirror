import { fixtureAgents, fixtureFills, type FixtureAgent, type FixtureFill } from "@/lib/fixtures";

export type Agent = FixtureAgent;
export type AgentFill = FixtureFill;

/**
 * Day-3 fixture shell for AgentRegistry + TrackRecord reads.
 *
 * TODO(Day 4+): replace the body with wagmi useReadContract calls against
 * AgentRegistry.agentCount/getAgent and TrackRecord.getFillsByAgent once
 * deployed addresses and generated ABIs are available.
 */
export function useAgents(): {
  agents: Agent[];
  isLoading: boolean;
  error: Error | null;
} {
  return { agents: fixtureAgents, isLoading: false, error: null };
}

export function useAgent(agentId: number): {
  agent: Agent | undefined;
  fills: AgentFill[];
  isLoading: boolean;
  error: Error | null;
} {
  return {
    agent: fixtureAgents.find((agent) => agent.id === agentId),
    fills: fixtureFills.filter((fill) => fill.agentId === agentId),
    isLoading: false,
    error: null,
  };
}
