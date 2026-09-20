"use client";

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { addressesFor, isDeployed, type MirrorAddresses } from "@/lib/contracts";

/**
 * The one place that decides whether the vault write hooks are talking to a
 * chain or to their fixture state.
 *
 * Deposit, follow and withdraw all need the same four things and the same
 * gate, and getting the gate wrong in any one of them is the failure mode
 * that matters: CopyVault's address is the zero address until Jason
 * publishes deployments/46630.json, and a write to the zero address doesn't
 * error — it succeeds, does nothing, and leaves the UI showing a balance
 * that never moved. `live` is false until every address a write touches is
 * real, and each hook keeps its mock path for that case.
 */
export function useVaultConnection(): {
  live: boolean;
  address?: Hex;
  addresses?: MirrorAddresses;
  writeContractAsync: ReturnType<typeof useWriteContract>["writeContractAsync"];
  publicClient: ReturnType<typeof usePublicClient>;
  /** Waits for a write to be mined, so balance re-reads see it. */
  confirm: (hash: Hex) => Promise<void>;
} {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const addresses = chainId ? addressesFor(chainId) : undefined;

  const live =
    !!address &&
    !!publicClient &&
    isDeployed(addresses?.copyVault) &&
    isDeployed(addresses?.usdg);

  async function confirm(hash: Hex) {
    if (!publicClient) return;
    await publicClient.waitForTransactionReceipt({ hash });
  }

  return { live, address, addresses, writeContractAsync, publicClient, confirm };
}
