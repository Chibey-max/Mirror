"use client";

import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { copyVaultAbi } from "@/lib/contracts";
import { fixtureWallet } from "@/lib/fixtures";
import { fromUsdg, toUsdg } from "@/lib/usdg";
import {
  useVaultConnection,
  type WriteProgress,
} from "@/hooks/useVaultConnection";

const MOCK_TX =
  "0x9f1b3d5a7c9e1b3a5f7d2c9e1b3a5f8c0e4b6d9a1c3e5f7b9d2a4c6e8f0b1d";
const MOCK_UNFOLLOW_TX =
  "0xb7d2c5e1a9f3b5d7c1e9a3f5b7d1c9e3a5f7b1d9c3e5a7f9b1d3a5c7e9f1b3d";

export type FollowInput = {
  agentId: number;
  capAmount: number;
  maxSlippageBps: number;
};

/**
 * Following an agent with a cap (PRD §5.2), and the balances that follow
 * from it.
 *
 * `agentIds` names the agents whose allocation this caller cares about,
 * CopyVault has no "agents I follow" view, `allocationOf` is per (user,
 * agent) pair, so the screen says which pairs to read. A page showing one
 * agent passes one id.
 *
 * What comes back per agent is `allocationOf`: principal committed, returned
 * unchanged at unfollow (PRD v2.2 §7.3). It is not the position's value, and
 * nothing here should be read as PnL, that comes from Mirrored events
 * priced at each fill (lib/pnl.ts).
 *
 * Until deployments/46630.json lands the fixture path runs instead.
 */
export function useFollow(initialFreeBalance: number, agentIds: number[] = []) {
  const { live, address, addresses, writeContractAsync, confirm } =
    useVaultConnection();

  const [mockAllocated, setMockAllocated] = useState<Record<number, number>>(
    fixtureWallet.allocated,
  );
  const [mockFreeBalance, setMockFreeBalance] = useState(initialFreeBalance);

  const freeRead = useReadContract({
    address: addresses?.copyVault,
    abi: copyVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: live && !!address },
  });

  const allocationReads = useReadContracts({
    contracts: agentIds.map((id) => ({
      address: addresses?.copyVault,
      abi: copyVaultAbi,
      functionName: "allocationOf",
      args: address ? [address, BigInt(id)] : undefined,
    })),
    query: { enabled: live && !!address && agentIds.length > 0 },
  });

  const followerReads = useReadContracts({
    contracts: agentIds.map((id) => ({
      address: addresses?.copyVault,
      abi: copyVaultAbi,
      functionName: "followersOf",
      args: [BigInt(id)],
    })),
    query: { enabled: live && !!address && agentIds.length > 0 },
  });

  const liveAllocated: Record<number, number> = {};
  agentIds.forEach((id, index) => {
    const result = allocationReads.data?.[index]?.result;
    // A reverted or still-loading read is not "zero allocated", leaving the
    // id out keeps the screen's `?? 0` from asserting an unfollow that the
    // chain never reported.
    if (typeof result === "bigint") liveAllocated[id] = fromUsdg(result);
  });

  const allocatedByAgent = live ? liveAllocated : mockAllocated;
  const followingByAgent: Record<number, boolean> = {};
  agentIds.forEach((id, index) => {
    const result = followerReads.data?.[index]?.result;
    if (Array.isArray(result) && address) {
      followingByAgent[id] = result.some(
        (follower) =>
          typeof follower === "string" &&
          follower.toLowerCase() === address.toLowerCase(),
      );
    }
  });
  const freeBalance = live ? fromUsdg(freeRead.data ?? BigInt(0)) : mockFreeBalance;

  async function follow(
    input: FollowInput,
    onProgress?: WriteProgress,
  ): Promise<{ txHash: string }> {
    const { agentId, capAmount, maxSlippageBps } = input;
    const alreadyFollowing = live
      ? followingByAgent[agentId] === true
      : Object.hasOwn(mockAllocated, agentId);

    if (
      alreadyFollowing ||
      !Number.isFinite(capAmount) ||
      capAmount <= 0 ||
      capAmount > freeBalance ||
      !Number.isFinite(maxSlippageBps) ||
      maxSlippageBps < 0
    ) {
      throw new Error("Invalid follow settings");
    }

    if (!live || !addresses) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      onProgress?.({ stage: "submitted", txHash: MOCK_TX });
      setMockAllocated((current) => ({ ...current, [agentId]: capAmount }));
      setMockFreeBalance((balance) => balance - capAmount);
      return { txHash: MOCK_TX };
    }

    const txHash = await writeContractAsync({
      address: addresses.copyVault,
      abi: copyVaultAbi,
      functionName: "follow",
      // maxSlippageBps is basis points, not a USDG amount, no unit
      // conversion, unlike the cap beside it.
      args: [BigInt(agentId), toUsdg(capAmount), BigInt(maxSlippageBps)],
    });
    onProgress?.({ stage: "submitted", txHash });
    await confirm(txHash);
    await Promise.all([
      freeRead.refetch(),
      allocationReads.refetch(),
      followerReads.refetch(),
    ]);
    return { txHash };
  }

  /**
   * Unfollow, the kill switch's write (PRD §5.3).
   *
   * The principal comes back unchanged (§7.3): the vault never settled
   * anything, so what was committed is what is released, and it lands in
   * free balance where withdraw can reach it. Live, that number comes back
   * from the chain with the rest of the re-read; against fixtures the two
   * local balances move by the allocation that was standing.
   */
  async function unfollow(
    agentId: number,
    onProgress?: WriteProgress,
  ): Promise<{ txHash: string }> {
    const allocation = allocatedByAgent[agentId] ?? 0;

    if (!live || !addresses) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      onProgress?.({ stage: "submitted", txHash: MOCK_UNFOLLOW_TX });
      setMockAllocated((current) => {
        const next = { ...current };
        delete next[agentId];
        return next;
      });
      setMockFreeBalance((balance) => balance + allocation);
      return { txHash: MOCK_UNFOLLOW_TX };
    }

    const txHash = await writeContractAsync({
      address: addresses.copyVault,
      abi: copyVaultAbi,
      functionName: "unfollow",
      args: [BigInt(agentId)],
    });
    onProgress?.({ stage: "submitted", txHash });
    await confirm(txHash);
    await Promise.all([
      freeRead.refetch(),
      allocationReads.refetch(),
      followerReads.refetch(),
    ]);
    return { txHash };
  }

  function addFreeBalance(amount: number) {
    if (live) {
      void freeRead.refetch();
      return;
    }
    setMockFreeBalance((balance) => balance + amount);
  }

  /** Withdraw's counterpart to addFreeBalance, same bridge, opposite direction. */
  function subtractFreeBalance(amount: number) {
    if (live) {
      void freeRead.refetch();
      return;
    }
    setMockFreeBalance((balance) => balance - amount);
  }

  return {
    allocatedByAgent,
    freeBalance,
    follow,
    unfollow,
    addFreeBalance,
    subtractFreeBalance,
  };
}
