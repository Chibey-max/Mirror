"use client";

import { useCallback } from "react";
import { useAccount, usePublicClient } from "wagmi";
import {
  addressesFor,
  copyVaultAbi,
  isDeployed,
  policyModuleAbi,
} from "@/lib/contracts";

/**
 * Proves a killed follow is actually dead, from chain state.
 *
 * PRD v2.2 §10: the kill switch can no longer be verified by catching a
 * revert. Under §7.1 a killed follow doesn't produce one, it is simply
 * absent from the mirror loop, so KillButton's `verify` callback has to
 * check the three facts that make "killed" true, all read fresh after the
 * transaction:
 *
 *   1. the policy is inactive,
 *   2. nothing is allocated to this agent any more,
 *   3. the wallet is no longer in the agent's follower set.
 *
 * All three, not one: an inactive policy with a stranded allocation is a bug
 * worth surfacing, not a successful kill.
 *
 * Until deployments/46630.json lands there is nothing to read, so it reports
 * success and the demo path stands in, the same behaviour the page had
 * before, but now in one place and labelled.
 */
export function useKillVerification(agentId: number) {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const addresses = chainId ? addressesFor(chainId) : undefined;

  const live =
    !!address &&
    !!publicClient &&
    isDeployed(addresses?.policyModule) &&
    isDeployed(addresses?.copyVault);

  const verify = useCallback(async (): Promise<boolean> => {
    if (!live || !addresses || !address || !publicClient) return true;

    const [policy, allocation, followers] = await Promise.all([
      publicClient.readContract({
        address: addresses.policyModule,
        abi: policyModuleAbi,
        functionName: "getPolicy",
        args: [address, BigInt(agentId)],
      }),
      publicClient.readContract({
        address: addresses.copyVault,
        abi: copyVaultAbi,
        functionName: "allocationOf",
        args: [address, BigInt(agentId)],
      }),
      publicClient.readContract({
        address: addresses.copyVault,
        abi: copyVaultAbi,
        functionName: "followersOf",
        args: [BigInt(agentId)],
      }),
    ]);

    const stillFollowing = followers.some(
      (follower) => follower.toLowerCase() === address.toLowerCase(),
    );

    // BigInt(0), not 0n: the project targets ES2017, where the literal
    // syntax isn't available.
    return policy.active === false && allocation === BigInt(0) && !stillFollowing;
  }, [live, addresses, address, publicClient, agentId]);

  return { verify, live };
}
