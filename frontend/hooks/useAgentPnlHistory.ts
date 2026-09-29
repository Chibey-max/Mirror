"use client";

import { targetChain } from "@/lib/chains";
import { formatUnits, type Address } from "viem";
import { useReadContract } from "wagmi";
import { addressesFor, isDeployed, trackRecordAbi } from "@/lib/contracts";
import {
  pnlPctSeriesTimed,
  type MirroredTrade,
  type TimedPnlPoint,
} from "@/lib/pnl";
import { ORACLE_PRICE_DECIMALS } from "@/lib/usdg";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

const HISTORY_SAMPLE = 200;

type RawFill = {
  fillId: bigint;
  token: Address;
  isBuy: boolean;
  size: bigint;
  price: bigint;
  timestamp: bigint;
};

function asRawFills(value: unknown): RawFill[] {
  if (!Array.isArray(value)) return [];
  return value.filter((fill): fill is RawFill => {
    if (!fill || typeof fill !== "object") return false;
    const c = fill as Partial<RawFill>;
    return (
      typeof c.fillId === "bigint" &&
      typeof c.size === "bigint" &&
      typeof c.price === "bigint" &&
      typeof c.timestamp === "bigint" &&
      typeof c.isBuy === "boolean" &&
      typeof c.token === "string"
    );
  });
}

/**
 * The ranged chart's own series, design prompt §5's "big PnL figure plus a
 * line chart with range pills," which nothing on the agent page rendered at
 * all before this. A dedicated read rather than reusing useAgents' own
 * multi-agent multicall: that one is built to answer "every agent, once,"
 * this needs one agent's fills WITH their timestamps and a deeper sample
 * than a card's sparkline ever did.
 *
 * Fixture path doesn't replay the three fixture fills, they're too few and
 * too recent to demonstrate range filtering at all. It spreads the agent's
 * own curated `pnlSeries` (already twelve points of real narrative, Red's
 * decline, Pulse's climb) evenly across the last 30 days instead, so 1D/7D
 * both show something and "All" shows the full shape the fixtures were
 * written to tell.
 */
export function useAgentPnlHistory(agentId: number): {
  points: TimedPnlPoint[];
  isLoading: boolean;
} {
  // Mirror's own chain, wallet or not (see useAgents).
  const trackRecord = addressesFor(targetChain.id)?.trackRecord;
  const live = isDeployed(trackRecord);

  const fillsRead = useReadContract({
    address: trackRecord,
    abi: trackRecordAbi,
    functionName: "getFillsByAgent",
    args: [BigInt(agentId), BigInt(0), BigInt(HISTORY_SAMPLE)],
    query: { enabled: live },
  });

  const fills = live ? asRawFills(fillsRead.data) : [];
  const tokens = [...new Set(fills.map((f) => f.token))];
  const metadata = useTokenMetadata(tokens, live);

  if (!live) return { points: [], isLoading: false };

  const trades: MirroredTrade[] = [...fills]
    .sort((a, b) => Number(a.fillId - b.fillId))
    .flatMap((fill): MirroredTrade[] => {
      const token = metadata.get(fill.token);
      if (!token) return [];
      return [
        {
          agentId,
          token: fill.token,
          isBuy: fill.isBuy,
          size: Number(formatUnits(fill.size, token.decimals)),
          price: Number(formatUnits(fill.price, ORACLE_PRICE_DECIMALS)),
          timestampSeconds: Number(fill.timestamp),
        },
      ];
    });

  return {
    points: pnlPctSeriesTimed(trades),
    isLoading: fillsRead.isLoading,
  };
}
