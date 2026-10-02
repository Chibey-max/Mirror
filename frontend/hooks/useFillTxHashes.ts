"use client";

import { useQuery } from "@tanstack/react-query";
import type { Hex } from "viem";
import { usePublicClient } from "wagmi";
import { targetChain } from "@/lib/chains";
import { addressesFor, deploymentBlockFor, isDeployed } from "@/lib/contracts";
import { logWindows } from "@/lib/onchain";
import { fillRecordedAbi } from "@/hooks/useFillEvents";

/**
 * The transaction that recorded each fill, by fill id.
 *
 * TrackRecord's views return a fill's contents, not the transaction behind
 * it, so a tape read from them had nothing to link to and every explorer
 * column said "n/a". The FillRecorded event is the one place the hash
 * lives: this reads them back from the deployment block, in windows, once
 * per agent (or for every agent, with no id).
 *
 * `fillCount` is how many fills the caller has: when it grows, the read
 * runs again so a backfilled fill picks up its hash too.
 */
export function useFillTxHashes(
  agentId: number | undefined,
  fillCount: number,
): Map<string, Hex> {
  const publicClient = usePublicClient({ chainId: targetChain.id });
  const trackRecord = addressesFor(targetChain.id)?.trackRecord;
  const live = isDeployed(trackRecord) && !!publicClient && fillCount > 0;

  const query = useQuery({
    queryKey: ["fill-tx-hashes", targetChain.id, trackRecord, agentId ?? "all", fillCount],
    enabled: live,
    staleTime: 60_000,
    // Keep showing the links already found while a bigger tape is read again.
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const latest = await publicClient!.getBlockNumber();
      const windows = logWindows(deploymentBlockFor(targetChain.id), latest);
      const pages = await Promise.all(
        windows.map(({ fromBlock, toBlock }) =>
          publicClient!.getContractEvents({
            address: trackRecord!,
            abi: fillRecordedAbi,
            eventName: "FillRecorded",
            args: agentId === undefined ? {} : { agentId: BigInt(agentId) },
            fromBlock,
            toBlock,
          }),
        ),
      );
      const hashes: [string, Hex][] = [];
      for (const log of pages.flat()) {
        if (log.args.fillId !== undefined && log.transactionHash) {
          hashes.push([log.args.fillId.toString(), log.transactionHash]);
        }
      }
      return hashes;
    },
  });

  return new Map(query.data ?? []);
}
