"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";
import type { PolicyRejectReason } from "@/components/PolicyRejectBanner";
import {
  decodePolicyReason,
  type TokenSymbolResolver,
} from "@/hooks/usePolicyError";
import { addressesFor, copyVaultAbi, isDeployed } from "@/lib/contracts";

/**
 * What one agent fill did to YOUR vault (PRD v2.2 §7.1/§10).
 *
 * A fill is agent-level; mirroring is per-follower. The same fill can pair
 * with a `Mirrored` event for one follower, a `MirrorRejected` for the next
 * and nothing at all for a third, so "mirrored to your vault" is never a
 * property of the fill itself, and a row with no outcome must say nothing
 * rather than claim the trade reached you.
 */
export type MirrorOutcome =
  | { status: "mirrored"; txHash?: string }
  | { status: "rejected"; reason: PolicyRejectReason; txHash?: string }
  /** No policy failure, there was simply nothing to mirror (§7.2: a sell
   *  clamps to the position held, and zero held means zero sold). Nothing
   *  happened on our side, so there's no tx to point at. */
  | { status: "skipped"; note: string };

/** Keyed the way fills are identified everywhere else: `fill-${fillId}`. */
export type MirrorOutcomes = Record<string, MirrorOutcome>;

/**
 * Sample outcomes for the fixture tape, standing in until CopyVault is
 * deployed. Only agent 1 appears, because fixtureWallet follows only agent 1
 * ($50 allocated), the other agents' fills correctly show no outcome.
 */
const fixtureMirrorOutcomes: MirrorOutcomes = {
  "fill-0": {
    status: "rejected",
    reason: { type: "CapExceeded", attempted: 68, cap: 50 },
    // A different tx from the fill's own, mirrorFill and recordFill are
    // two separate transactions on chain, and the fixture keeps that true
    // rather than reusing the fill's hash for both.
    txHash: "0xb2e5f8a1c4d7e0b3f6a9c2e5d8b1f4a7c0e3d6a9f2c5e8b1d4a7f0c3e6b9d2f5",
  },
  "fill-1": {
    status: "mirrored",
    txHash: "0xa4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7",
  },
  "fill-2": {
    status: "skipped",
    note: "you held no mAAPL to sell",
  },
};

type OutcomeLog = {
  eventName: "Mirrored" | "MirrorRejected";
  args: { fillId?: bigint; reason?: Hex };
  transactionHash: Hex | null;
};

/** One Mirrored or MirrorRejected log as the outcome it records. */
function outcomeFrom(
  log: OutcomeLog,
  resolveSymbol?: TokenSymbolResolver,
): [string, MirrorOutcome] | undefined {
  if (log.args.fillId === undefined) return undefined;
  const id = `fill-${log.args.fillId}`;
  const txHash = log.transactionHash ?? undefined;
  if (log.eventName === "Mirrored") return [id, { status: "mirrored", txHash }];
  if (!log.args.reason) return undefined;
  const reason = decodePolicyReason(log.args.reason, resolveSymbol);
  // An undecodable reason is still a rejection, say so without inventing a
  // cause.
  return [
    id,
    reason
      ? { status: "rejected", reason, txHash }
      : { status: "skipped", note: "not mirrored to your vault" },
  ];
}

function outcomesFrom(
  logs: OutcomeLog[],
  resolveSymbol?: TokenSymbolResolver,
): MirrorOutcomes {
  const outcomes: MirrorOutcomes = {};
  for (const log of logs) {
    const entry = outcomeFrom(log, resolveSymbol);
    if (entry) outcomes[entry[0]] = entry[1];
  }
  return outcomes;
}

/**
 * Your own mirror outcomes for an agent's fills (or every agent's, with no
 * agentId), newest write wins per fill.
 *
 * Two sources, like the fill feed: the vault's past Mirrored and
 * MirrorRejected logs for this wallet, read once on load, and a watch for
 * new ones. Watching alone left every outcome from before the page opened
 * blank, so after a reload a mirrored fill and a rejected one both looked
 * like nothing had happened. Both events are indexed on user and agentId,
 * so the node does the filtering.
 *
 * `historyLoaded` is false until the past logs are in (or if they can't be
 * read): a fill with no outcome only means "nothing happened to your vault"
 * once history has loaded, and screens should say they're still checking
 * before then rather than assert it.
 *
 * Inert until deployments land, watching the zero address would look live
 * while never firing, and the fixture map above carries the demo until then.
 */
export function useMirrorOutcomes(
  agentId?: number,
  resolveSymbol?: TokenSymbolResolver,
): { outcomes: MirrorOutcomes; historyLoaded: boolean } {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const vault = chainId ? addressesFor(chainId)?.copyVault : undefined;
  const [watched, setWatched] = useState<MirrorOutcomes>({});

  const live = !!address && isDeployed(vault);
  const args = {
    user: address,
    ...(agentId === undefined ? {} : { agentId: BigInt(agentId) }),
  };

  const history = useQuery({
    queryKey: ["mirror-outcome-history", chainId, vault, address, agentId ?? "all"],
    enabled: live && !!publicClient,
    queryFn: async () => {
      const [mirrored, rejected] = await Promise.all([
        publicClient!.getContractEvents({
          address: vault!,
          abi: copyVaultAbi,
          eventName: "Mirrored",
          args,
          fromBlock: "earliest",
        }),
        publicClient!.getContractEvents({
          address: vault!,
          abi: copyVaultAbi,
          eventName: "MirrorRejected",
          args,
          fromBlock: "earliest",
        }),
      ]);
      // Chain order, so a later outcome for the same fill wins.
      return [...mirrored, ...rejected]
        .sort((a, b) =>
          a.blockNumber === b.blockNumber
            ? (a.logIndex ?? 0) - (b.logIndex ?? 0)
            : a.blockNumber < b.blockNumber
              ? -1
              : 1,
        )
        .map((log) => ({
          eventName: log.eventName,
          args: log.args as OutcomeLog["args"],
          transactionHash: log.transactionHash,
        }));
    },
  });

  useWatchContractEvent({
    address: vault,
    abi: copyVaultAbi,
    eventName: "Mirrored",
    args,
    enabled: live,
    onLogs(logs) {
      const next = outcomesFrom(
        logs.map((log) => ({
          eventName: "Mirrored" as const,
          args: log.args,
          transactionHash: log.transactionHash,
        })),
        resolveSymbol,
      );
      setWatched((prev) => ({ ...prev, ...next }));
    },
  });

  useWatchContractEvent({
    address: vault,
    abi: copyVaultAbi,
    eventName: "MirrorRejected",
    args,
    enabled: live,
    onLogs(logs) {
      const next = outcomesFrom(
        logs.map((log) => ({
          eventName: "MirrorRejected" as const,
          args: log.args,
          transactionHash: log.transactionHash,
        })),
        resolveSymbol,
      );
      setWatched((prev) => ({ ...prev, ...next }));
    },
  });

  if (!live) return { outcomes: fixtureMirrorOutcomes, historyLoaded: true };
  return {
    // Watched outcomes are newer than anything in the one-off history read.
    outcomes: { ...outcomesFrom(history.data ?? [], resolveSymbol), ...watched },
    historyLoaded: history.isSuccess,
  };
}
