"use client";

import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits, type Address } from "viem";
import {
  addressesFor,
  agentRegistryAbi,
  copyVaultAbi,
  isDeployed,
  trackRecordAbi,
} from "@/lib/contracts";
import {
  fixtureAgents,
  fixtureFills,
  type FixtureAgent,
  type FixtureFill,
} from "@/lib/fixtures";
import { computeAgentPnl, type MirroredTrade } from "@/lib/pnl";
import { USDG_DECIMALS } from "@/lib/usdg";
import { useFillEvents } from "@/hooks/useFillEvents";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

export type Agent = FixtureAgent;
export type AgentFill = FixtureFill;

/**
 * IAgentRegistry.Agent and ITrackRecord.Fill as they come back from a
 * dynamically built multicall, where the result type is `unknown` — the
 * tuple typing viem gives a single read doesn't survive the array. Both
 * guards check the fields actually used, so a shape change fails to a
 * skipped row rather than to a rendered `undefined`.
 */
type RegistryRecord = {
  name: string;
  strategyHash: `0x${string}`;
  modelVersion: string;
  registeredAt: bigint;
  active: boolean;
};

type RecordedFill = {
  fillId: bigint;
  token: Address;
  isBuy: boolean;
  size: bigint;
  price: bigint;
};

function asRegistryRecord(value: unknown): RegistryRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Partial<RegistryRecord>;
  const valid =
    typeof record.name === "string" &&
    typeof record.modelVersion === "string" &&
    typeof record.strategyHash === "string" &&
    typeof record.registeredAt === "bigint";
  return valid ? (record as RegistryRecord) : undefined;
}

function asRecordedFills(value: unknown): RecordedFill[] {
  if (!Array.isArray(value)) return [];
  return value.filter((fill): fill is RecordedFill => {
    if (!fill || typeof fill !== "object") return false;
    const candidate = fill as Partial<RecordedFill>;
    return (
      typeof candidate.fillId === "bigint" &&
      typeof candidate.size === "bigint" &&
      typeof candidate.price === "bigint" &&
      typeof candidate.isBuy === "boolean" &&
      typeof candidate.token === "string"
    );
  });
}

/** Fills read per agent for the list's counts and PnL. */
const FILL_SAMPLE = 100;

/**
 * The agent list, from AgentRegistry.
 *
 * Three of the card's fields aren't in the registry and are assembled here:
 * follower count from CopyVault, fill count and volume from TrackRecord, and
 * PnL from those fills through the same `computeAgentPnl` the leaderboard
 * uses — so the two screens can't disagree.
 *
 * One field has no on-chain source at all. `strategy` is the human label
 * ("Momentum"); the registry stores `strategyHash` — a commitment, not a
 * name — and `modelVersion`. Live agents show their model version rather
 * than a label invented in the frontend.
 *
 * Inert until deployments/46630.json lands, when fixtures stand in.
 */
export function useAgents(): {
  agents: Agent[];
  isLoading: boolean;
  error: Error | null;
} {
  const { chainId } = useAccount();
  const addresses = chainId ? addressesFor(chainId) : undefined;
  const live = isDeployed(addresses?.agentRegistry);

  const count = useReadContract({
    address: addresses?.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "agentCount",
    query: { enabled: live },
  });

  // Agent ids are 1-based and contiguous (AgentRegistry increments on
  // register), so the count is the id range.
  const ids = Array.from(
    { length: live ? Number(count.data ?? BigInt(0)) : 0 },
    (_, index) => index + 1,
  );

  const registry = useReadContracts({
    contracts: ids.map((id) => ({
      address: addresses?.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "getAgent",
      args: [BigInt(id)],
    })),
    query: { enabled: live && ids.length > 0 },
  });

  const activity = useReadContracts({
    contracts: ids.flatMap((id) => [
      {
        address: addresses?.trackRecord,
        abi: trackRecordAbi,
        functionName: "getFillsByAgent",
        args: [BigInt(id), BigInt(0), BigInt(FILL_SAMPLE)],
      } as const,
      {
        address: addresses?.copyVault,
        abi: copyVaultAbi,
        functionName: "followerCountOf",
        args: [BigInt(id)],
      } as const,
    ]),
    query: {
      enabled:
        live &&
        ids.length > 0 &&
        isDeployed(addresses?.trackRecord) &&
        isDeployed(addresses?.copyVault),
    },
  });

  const fillsByAgent = new Map<number, RecordedFill[]>();
  ids.forEach((id, index) => {
    fillsByAgent.set(id, asRecordedFills(activity.data?.[index * 2]?.result));
  });
  const tokens = [
    ...new Set([...fillsByAgent.values()].flat().map((fill) => fill.token)),
  ];
  const metadata = useTokenMetadata(tokens, live);

  if (!live) {
    return { agents: fixtureAgents, isLoading: false, error: null };
  }

  const agents: Agent[] = [];
  ids.forEach((id, index) => {
    const record = asRegistryRecord(registry.data?.[index]?.result);
    if (!record) return;

    const fills = fillsByAgent.get(id) ?? [];
    const followers = activity.data?.[index * 2 + 1]?.result;

    /*
     * A fill whose token metadata hasn't resolved is counted but not
     * priced: its `size` is in units this code can't scale, and guessing
     * would put the agent's PnL out by whatever the decimals turn out to
     * be. Both numbers below are therefore over the priced subset.
     *
     * Oldest first, so a cost basis accumulates before anything sells
     * against it.
     */
    const priced = [...fills]
      .sort((a, b) => Number(a.fillId - b.fillId))
      .flatMap((fill): MirroredTrade[] => {
        const token = metadata.get(fill.token);
        if (!token) return [];
        return [
          {
            agentId: id,
            token: fill.token,
            isBuy: fill.isBuy,
            size: Number(formatUnits(fill.size, token.decimals)),
            price: Number(formatUnits(fill.price, USDG_DECIMALS)),
          },
        ];
      });

    const pnl = computeAgentPnl(priced).get(id);
    const volumeUsd = priced.reduce(
      (total, trade) => total + trade.size * trade.price,
      0,
    );

    agents.push({
      id,
      name: record.name,
      // No on-chain label — the model version is the closest true thing.
      strategy: record.modelVersion,
      modelVersion: record.modelVersion,
      strategyHash: record.strategyHash,
      registeredAt: new Date(Number(record.registeredAt) * 1000)
        .toISOString()
        .slice(0, 10),
      pnlPct: pnl?.pnlPct ?? 0,
      pnlUsd: pnl?.pnlUsd ?? 0,
      fills: fills.length,
      followers: typeof followers === "bigint" ? Number(followers) : 0,
      volumeUsd: Math.round(volumeUsd * 100) / 100,
      isLosing: (pnl?.pnlPct ?? 0) < 0,
    });
  });

  return {
    agents,
    isLoading: count.isLoading || registry.isLoading || activity.isLoading,
    error: (count.error ?? registry.error ?? activity.error) as Error | null,
  };
}

/** One agent, with its tape. */
export function useAgent(agentId: number): {
  agent: Agent | undefined;
  fills: AgentFill[];
  isLoading: boolean;
  error: Error | null;
} {
  const { agents, isLoading, error } = useAgents();
  const { fills, isLoading: fillsLoading } = useFillEvents(agentId);

  return {
    agent: agents.find((agent) => agent.id === agentId),
    // The fixture path filters the same way useFillEvents does live, so the
    // detail page reads one source either way.
    fills: agents === fixtureAgents
      ? fixtureFills.filter((fill) => fill.agentId === agentId)
      : fills,
    isLoading: isLoading || fillsLoading,
    error,
  };
}
