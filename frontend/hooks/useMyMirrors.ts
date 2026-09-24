"use client";

import { formatUnits, type Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import {
  addressesFor,
  isDeployed,
  trackRecordAbi,
} from "@/lib/contracts";
import { fixtureFills, type FixtureFill } from "@/lib/fixtures";
import { relativeTime } from "@/lib/format";
import { ORACLE_PRICE_DECIMALS } from "@/lib/usdg";
import {
  useMirrorOutcomes,
  type MirrorOutcome,
  type MirrorOutcomes,
} from "@/hooks/useMirrorOutcomes";
import { latestFillPage } from "@/lib/onchain";
import { useTokenMetadata } from "@/hooks/useTokenMetadata";

/** The personal view of the public log (briefing §09.C): every fill from
 *  every agent you follow, each carrying whatever happened to YOUR vault. */
export type MirrorRow = {
  id: string;
  agentId: number;
  agentName: string;
  side: "BUY" | "SELL";
  token: string;
  size: string;
  price: string;
  time: string;
  /** Full ISO string for the hover title, the row shows relative time,
   *  a judge checking the tape wants the absolute one on demand. */
  timeAbsolute: string;
  outcome: MirrorOutcome | undefined;
};

const FILL_SAMPLE = 30;

type RawFill = {
  fillId: bigint;
  agentId: bigint;
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
      typeof c.agentId === "bigint" &&
      typeof c.size === "bigint" &&
      typeof c.price === "bigint" &&
      typeof c.timestamp === "bigint" &&
      typeof c.isBuy === "boolean" &&
      typeof c.token === "string"
    );
  });
}

/** 0.420000000000000000 -> 0.42, without touching a whole number. */
function trimZeros(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/**
 * "Your mirrors" (briefing §09.C): the personal, per-follower view of the
 * public Mirrored/MirrorRejected log. `useMirrorOutcomes` is per-agent by
 * design, mirroring is a per-follower fact, so it needs the caller to name
 * the pairs, this fans that same lookup out across every agent followed,
 * called with no agentId so it watches every outcome for this wallet.
 */
export function useMyMirrors(
  agentIds: number[],
  agentNames: Record<number, string>,
): { rows: MirrorRow[]; isLoading: boolean; outcomesLoaded: boolean } {
  const { chainId } = useAccount();
  const addresses = chainId ? addressesFor(chainId) : undefined;
  const live = isDeployed(addresses?.trackRecord) && agentIds.length > 0;

  // The tape is oldest first, so each agent's count comes first and the
  // read asks for its newest FILL_SAMPLE fills, not its first ones.
  const countsRead = useReadContracts({
    contracts: agentIds.map((id) => ({
      address: addresses?.trackRecord,
      abi: trackRecordAbi,
      functionName: "fillCountByAgent",
      args: [BigInt(id)],
    })),
    query: { enabled: live },
  });
  const pages = agentIds.flatMap((id, index) => {
    const count = countsRead.data?.[index]?.result;
    if (typeof count !== "bigint" || count === BigInt(0)) return [];
    return [{ id, ...latestFillPage(count, FILL_SAMPLE) }];
  });

  const fillsRead = useReadContracts({
    contracts: pages.map((page) => ({
      address: addresses?.trackRecord,
      abi: trackRecordAbi,
      functionName: "getFillsByAgent",
      args: [BigInt(page.id), page.offset, page.limit],
    })),
    query: { enabled: live && pages.length > 0 },
  });

  // No agentId: every Mirrored/MirrorRejected for this wallet, not one
  // agent's slice of it.
  const { outcomes, historyLoaded } = useMirrorOutcomes();

  const liveFills: { fill: RawFill }[] = live
    ? pages.flatMap((_, index) =>
        asRawFills(fillsRead.data?.[index]?.result).map((fill) => ({ fill })),
      )
    : [];
  const tokens = [...new Set(liveFills.map(({ fill }) => fill.token))];
  const metadata = useTokenMetadata(tokens, live);

  if (!live) {
    const rows = buildFixtureRows(agentIds, agentNames, outcomes);
    return { rows, isLoading: false, outcomesLoaded: true };
  }

  const rows: MirrorRow[] = liveFills
    .sort((a, b) => (a.fill.fillId < b.fill.fillId ? 1 : a.fill.fillId > b.fill.fillId ? -1 : 0))
    .map(({ fill }) => {
      const token = metadata.get(fill.token);
      const id = `fill-${fill.fillId}`;
      const date = new Date(Number(fill.timestamp) * 1000);
      return {
        id,
        agentId: Number(fill.agentId),
        agentName: agentNames[Number(fill.agentId)] ?? `Agent #${fill.agentId}`,
        side: fill.isBuy ? "BUY" : "SELL",
        token: token?.symbol ?? "n/a",
        size: token ? trimZeros(formatUnits(fill.size, token.decimals)) : "n/a",
        price: formatUnits(fill.price, ORACLE_PRICE_DECIMALS),
        time: relativeTime(Number(fill.timestamp)),
        timeAbsolute: date.toISOString(),
        outcome: outcomes[id],
      };
    });

  return {
    rows,
    isLoading: countsRead.isLoading || fillsRead.isLoading,
    outcomesLoaded: historyLoaded,
  };
}

function buildFixtureRows(
  agentIds: number[],
  agentNames: Record<number, string>,
  outcomes: MirrorOutcomes,
): MirrorRow[] {
  const fills: FixtureFill[] = fixtureFills.filter((f) =>
    agentIds.includes(f.agentId),
  );
  return fills
    .sort((a, b) => b.sequence - a.sequence)
    .map((fill) => ({
      id: fill.id,
      agentId: fill.agentId,
      agentName: agentNames[fill.agentId] ?? `Agent #${fill.agentId}`,
      side: fill.side,
      token: fill.token,
      size: fill.size,
      price: fill.price,
      time: fill.time,
      timeAbsolute: fill.time,
      outcome: outcomes[fill.id],
    }));
}
