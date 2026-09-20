"use client";

import { useState } from "react";
import { formatUnits, type Abi, type Address } from "viem";
import { useAccount, useReadContract, useWatchContractEvent } from "wagmi";
import { addressesFor, isDeployed, trackRecordAbi } from "@/lib/contracts";
import { fixtureFills, type FixtureFill } from "@/lib/fixtures";
import { relativeTime } from "@/lib/format";
import { shortAddress, type TokenMetadata } from "@/lib/tokens";
import { USDG_DECIMALS } from "@/lib/usdg";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

/**
 * TrackRecord's FillRecorded event, hand-kept in sync with
 * contracts/src/interfaces/ITrackRecord.sol on origin/feat/contracts-scaffold
 * (Isaac). Same duplicate-not-import reasoning as usePolicyError's
 * policyErrorsAbi: the frontend stays independently buildable from the
 * contracts workspace, and any drift after the Day-3 ABI freeze is a
 * whole-team sync, not a silent one-sided edit.
 */
export const fillRecordedAbi = [
  {
    type: "event",
    name: "FillRecorded",
    inputs: [
      { name: "fillId", type: "uint256", indexed: true },
      { name: "agentId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "size", type: "uint256", indexed: false },
      { name: "price", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint64", indexed: false },
      { name: "oracleRoundId", type: "bytes32", indexed: false },
    ],
  },
] as const satisfies Abi;

/** The raw shape a decoded FillRecorded log carries — mirrors ITrackRecord.Fill exactly. */
export type OnChainFill = {
  fillId: bigint;
  agentId: bigint;
  token: `0x${string}`;
  isBuy: boolean;
  size: bigint;
  price: bigint;
  timestamp: bigint;
  oracleRoundId: `0x${string}`;
};

/**
 * Bridges a real on-chain Fill (raw units, no display formatting) into the
 * shape FillFeed/LeaderboardTable already render. Exists now, ahead of the
 * actual wiring, so that step is a hook-body swap, not a rewrite of every
 * consuming component.
 *
 * `size`/`price` are left as decimal strings by the caller's own
 * formatUnits call (token decimals aren't knowable from the event alone —
 * MockUSDG is 6dp, Stock Tokens' decimals aren't frozen anywhere yet), so
 * this only reshapes and doesn't attempt unit conversion itself.
 */
export function fillFromOnChain(
  fill: OnChainFill,
  opts: {
    tokenSymbol: string;
    sizeFormatted: string;
    priceFormatted: string;
    timeFormatted: string;
    /** Empty for a fill read back from TrackRecord: the view returns the
     *  fill, not the transaction that recorded it. */
    txHash: string;
    sequence: number;
  },
): FixtureFill {
  return {
    id: `fill-${fill.fillId}`,
    agentId: Number(fill.agentId),
    side: fill.isBuy ? "BUY" : "SELL",
    token: opts.tokenSymbol,
    size: opts.sizeFormatted,
    price: opts.priceFormatted,
    time: opts.timeFormatted,
    txHash: opts.txHash,
    sequence: opts.sequence,
  };
}

/** How far back the feed reaches on load. The tape's own page does the
 *  deep history; this is the "live activity" panel. */
const BACKFILL_LIMIT = 50;

/**
 * Fills for one agent (or all, if agentId is omitted), newest first.
 *
 * Two sources, because a feed that only watches is empty until the next
 * fill lands: TrackRecord.getFillsByAgent backfills what already happened,
 * and FillRecorded prepends each new one as it arrives. Nothing here runs
 * off a client-side timer.
 *
 * Sizes are formatted with the token's own decimals, read from the token
 * itself — the same `size` is 0.42 shares or 4.2e17 depending on them, and
 * the stock tokens' decimals aren't frozen in any doc. Prices are USDG.
 *
 * `getFillsByAgent` needs an agent, so the all-agents case stays on
 * fixtures until there's a reason to fan out across the registry.
 */
export function useFillEvents(agentId?: number): {
  fills: FixtureFill[];
  isLoading: boolean;
} {
  const { chainId } = useAccount();
  const trackRecord = chainId ? addressesFor(chainId)?.trackRecord : undefined;
  const live = agentId !== undefined && isDeployed(trackRecord);

  /** A watched fill knows the transaction it arrived in; a backfilled one
   *  does not — getFillsByAgent returns fills, not receipts. */
  const [watched, setWatched] = useState<IndexedFill[]>([]);

  const backfill = useReadContract({
    address: trackRecord,
    abi: trackRecordAbi,
    functionName: "getFillsByAgent",
    args: agentId === undefined
      ? undefined
      : [BigInt(agentId), BigInt(0), BigInt(BACKFILL_LIMIT)],
    query: { enabled: live },
  });

  useWatchContractEvent({
    address: trackRecord,
    abi: fillRecordedAbi,
    eventName: "FillRecorded",
    args: agentId === undefined ? {} : { agentId: BigInt(agentId) },
    enabled: live,
    onLogs(logs) {
      const fills = logs
        .filter((log) => log.args?.fillId !== undefined)
        .map((log) => ({
          ...(log.args as OnChainFill),
          txHash: log.transactionHash ?? undefined,
        }));
      setWatched((current) => [...current, ...fills]);
    },
  });

  const onChain: IndexedFill[] = live
    ? [...(backfill.data ?? []), ...watched]
    : [];
  // Same fill can arrive twice — once in the backfill, once from the watch
  // if it lands mid-load.
  const unique = new Map(onChain.map((fill) => [fill.fillId.toString(), fill]));
  const tokens = [...new Set([...unique.values()].map((fill) => fill.token))];
  const metadata = useTokenMetadata(tokens, live);

  if (!live) {
    const fills = agentId
      ? fixtureFills.filter((f) => f.agentId === agentId)
      : fixtureFills;
    return { fills, isLoading: false };
  }

  const fills = [...unique.values()]
    .sort((a, b) => Number(b.timestamp - a.timestamp))
    .map((fill) => toDisplayFill(fill, metadata.get(fill.token)));

  return { fills, isLoading: backfill.isLoading };
}

type IndexedFill = OnChainFill & { txHash?: `0x${string}` };

function toDisplayFill(
  fill: IndexedFill,
  token: TokenMetadata | undefined,
): FixtureFill {
  return fillFromOnChain(fill, {
    // An unresolved token shows its address, never a guessed symbol.
    tokenSymbol: token?.symbol ?? shortAddress(fill.token as Address),
    sizeFormatted: token
      ? trimZeros(formatUnits(fill.size, token.decimals))
      : "—",
    priceFormatted: formatUnits(fill.price, USDG_DECIMALS),
    timeFormatted: relativeTime(Number(fill.timestamp)),
    // Only a watched fill has one. A row without it renders without the
    // explorer link rather than linking somewhere wrong.
    txHash: fill.txHash ?? "",
    // fillIds are issued in order, which is all `sequence` is for.
    sequence: Number(fill.fillId),
  });
}

/** 0.420000000000000000 -> 0.42, without touching a whole number. */
function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}
