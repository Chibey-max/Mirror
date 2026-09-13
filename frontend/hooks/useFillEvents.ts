import { type Abi } from "viem";
import { fixtureFills, type FixtureFill } from "@/lib/fixtures";

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
    txHash: `0x${string}`;
    block: number;
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
    block: opts.block,
  };
}

/**
 * Fills for one agent (or all, if agentId is omitted), newest first.
 *
 * TODO(Day 9+, once Jason's Runner produces real fills and addresses land in
 * lib/contracts.ts): replace the fixture read below with wagmi's
 * useWatchContractEvent(fillRecordedAbi) on TrackRecord, keyed by agentId,
 * piping each log through fillFromOnChain() above — so a fill hits this
 * hook, and therefore FillFeed and the vault balance, live off the chain
 * itself, never off a client-side timer.
 */
export function useFillEvents(agentId?: number): { fills: FixtureFill[] } {
  const fills = agentId
    ? fixtureFills.filter((f) => f.agentId === agentId)
    : fixtureFills;

  return { fills };
}
