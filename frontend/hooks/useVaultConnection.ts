"use client";

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { addressesFor, isDeployed, type MirrorAddresses } from "@/lib/contracts";
import { assertSuccessfulReceipt } from "@/lib/onchain";

/**
 * How far along a write is, reported as it happens.
 *
 * The screens have always had these stages; they were driven by fixed
 * timers, so "Approving…" lasted 350ms whether or not an approval was
 * needed and "Pending" was a 600ms pause after the work was already done.
 * The hooks know the real answer, an approval that was skipped is never
 * announced, and `submitted` fires when the transaction has a hash and the
 * wait for its receipt begins.
 */
export type WriteProgress = (
  event: { stage: "approving" } | { stage: "submitted"; txHash: string },
) => void;

/**
 * The one place that decides whether the vault write hooks are talking to a
 * chain or to their fixture state.
 *
 * Deposit, follow and withdraw all need the same four things and the same
 * gate, and getting the gate wrong in any one of them is the failure mode
 * that matters: CopyVault's address is the zero address until Jason
 * publishes deployments/46630.json, and a write to the zero address doesn't
 * error, it succeeds, does nothing, and leaves the UI showing a balance
 * that never moved. `live` is false until every address a write touches is
 * real, and each hook keeps its mock path only in explicit fixture mode.
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
  const { writeContractAsync: send } = useWriteContract();
  const addresses = chainId ? addressesFor(chainId) : undefined;

  const live =
    !!address &&
    !!publicClient &&
    isDeployed(addresses?.copyVault) &&
    isDeployed(addresses?.usdg);

  // Every write is simulated first. A revert then arrives here as a decoded
  // contract error (FollowerLimitReached, AgentInactive...) before the wallet
  // even opens, instead of as whatever the wallet chooses to report, which
  // usually drops the error name. Same parameters, so it can't disagree with
  // the write that follows.
  //
  // The casts only bridge wagmi's per-call generics, which can't be threaded
  // through a pass-through wrapper; callers still see send's exact signature.
  const writeContractAsync = (async (parameters: Parameters<typeof send>[0]) => {
    if (publicClient && address) {
      await publicClient.simulateContract({
        ...parameters,
        account: address,
      } as never);
    }
    return send(parameters as never);
  }) as typeof send;

  async function confirm(hash: Hex) {
    if (!publicClient) throw new Error("No public client is available to confirm the transaction");
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    // A reverted transaction still produces a receipt; without this check it
    // resolved like a success and the screen reported a change that never
    // happened.
    assertSuccessfulReceipt(receipt, hash);
  }

  return { live, address, addresses, writeContractAsync, publicClient, confirm };
}
