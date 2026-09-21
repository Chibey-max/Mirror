"use client";

import { useState } from "react";
import { useAccount, useWatchContractEvent } from "wagmi";
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
 * and nothing at all for a third — so "mirrored to your vault" is never a
 * property of the fill itself, and a row with no outcome must say nothing
 * rather than claim the trade reached you.
 */
export type MirrorOutcome =
  | { status: "mirrored"; txHash?: string }
  | { status: "rejected"; reason: PolicyRejectReason; txHash?: string }
  /** No policy failure — there was simply nothing to mirror (§7.2: a sell
   *  clamps to the position held, and zero held means zero sold). Nothing
   *  happened on our side, so there's no tx to point at. */
  | { status: "skipped"; note: string };

/** Keyed the way fills are identified everywhere else: `fill-${fillId}`. */
export type MirrorOutcomes = Record<string, MirrorOutcome>;

/**
 * Sample outcomes for the fixture tape, standing in until CopyVault is
 * deployed. Only agent 1 appears, because fixtureWallet follows only agent 1
 * ($50 allocated) — the other agents' fills correctly show no outcome.
 */
const fixtureMirrorOutcomes: MirrorOutcomes = {
  "fill-0": {
    status: "rejected",
    reason: { type: "CapExceeded", attempted: 68, cap: 50 },
    // A different tx from the fill's own — mirrorFill and recordFill are
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

/**
 * Your own mirror outcomes for an agent's fills, newest write wins per fill.
 *
 * Both events are indexed on user/agentId/fillId, so the node does the
 * filtering. Inert until deployments/46630.json lands — watching the zero
 * address would look live while never firing — and the fixture map above
 * carries the demo until then.
 */
export function useMirrorOutcomes(
  agentId?: number,
  resolveSymbol?: TokenSymbolResolver,
): MirrorOutcomes {
  const { address, chainId } = useAccount();
  const vault = chainId ? addressesFor(chainId)?.copyVault : undefined;
  const [outcomes, setOutcomes] = useState<MirrorOutcomes>({});

  const live = !!address && isDeployed(vault);
  const args = {
    user: address,
    ...(agentId === undefined ? {} : { agentId: BigInt(agentId) }),
  };

  useWatchContractEvent({
    address: vault,
    abi: copyVaultAbi,
    eventName: "Mirrored",
    args,
    enabled: live,
    onLogs(logs) {
      const next: MirrorOutcomes = {};
      for (const log of logs) {
        if (log.args?.fillId === undefined) continue;
        next[`fill-${log.args.fillId}`] = {
          status: "mirrored",
          txHash: log.transactionHash ?? undefined,
        };
      }
      setOutcomes((prev) => ({ ...prev, ...next }));
    },
  });

  useWatchContractEvent({
    address: vault,
    abi: copyVaultAbi,
    eventName: "MirrorRejected",
    args,
    enabled: live,
    onLogs(logs) {
      const next: MirrorOutcomes = {};
      for (const log of logs) {
        if (log.args?.fillId === undefined || !log.args?.reason) continue;
        const reason = decodePolicyReason(log.args.reason, resolveSymbol);
        // An undecodable reason is still a rejection — say so without
        // inventing a cause.
        const txHash = log.transactionHash ?? undefined;
        next[`fill-${log.args.fillId}`] = reason
          ? { status: "rejected", reason, txHash }
          : { status: "skipped", note: "not mirrored to your vault" };
      }
      setOutcomes((prev) => ({ ...prev, ...next }));
    },
  });

  return live ? outcomes : fixtureMirrorOutcomes;
}
