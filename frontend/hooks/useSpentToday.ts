"use client";

import { useAccount, useReadContracts } from "wagmi";
import { addressesFor, isDeployed, policyModuleAbi } from "@/lib/contracts";
import { fromUsdg } from "@/lib/usdg";

/**
 * How much of each agent's daily cap this wallet has already used —
 * `PolicyModule.spentToday`, the same number `CapExceeded.attempted` builds
 * on (§7.6). This is the read the design prompt's "spent today" progress
 * bar needs and nothing in the app reads yet: the cap is the whole product,
 * and until this exists a follower sets one and never sees it again.
 *
 * Keyed by agent id, matching the shape `useFollow`'s `allocatedByAgent`
 * already uses — the same number doubles as the cap `follow()` sets on
 * PolicyModule, so a progress bar is `spentToday / allocatedByAgent[id]`
 * with no second read needed for the denominator.
 *
 * Inert until deployments/46630.json lands; an id with no entry in the
 * fixture map or the live result has spent nothing.
 */
export function useSpentToday(agentIds: number[]): Record<number, number> {
  const { address, chainId } = useAccount();
  const addresses = chainId ? addressesFor(chainId) : undefined;
  const live = !!address && isDeployed(addresses?.policyModule);

  const reads = useReadContracts({
    contracts: agentIds.map((id) => ({
      address: addresses?.policyModule,
      abi: policyModuleAbi,
      functionName: "spentToday",
      args: address ? [address, BigInt(id)] : undefined,
    })),
    query: { enabled: live && agentIds.length > 0 },
  });

  if (!live) return {};

  const spent: Record<number, number> = {};
  agentIds.forEach((id, index) => {
    const result = reads.data?.[index]?.result;
    if (typeof result === "bigint") spent[id] = fromUsdg(result);
  });
  return spent;
}
