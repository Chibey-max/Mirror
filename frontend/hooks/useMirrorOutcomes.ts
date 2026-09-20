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
  | { status: "mirrored" }
  | { status: "rejected"; reason: PolicyRejectReason }
  /** No policy failure — there was simply nothing to mirror (§7.2: a sell
   *  clamps to the position held, and zero held means zero sold). */
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
  },
  "fill-1": { status: "mirrored" },
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
        next[`fill-${log.args.fillId}`] = { status: "mirrored" };
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
        next[`fill-${log.args.fillId}`] = reason
          ? { status: "rejected", reason }
          : { status: "skipped", note: "not mirrored to your vault" };
      }
      setOutcomes((prev) => ({ ...prev, ...next }));
    },
  });

  return live ? outcomes : fixtureMirrorOutcomes;
}
