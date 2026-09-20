"use client";

import { useState } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { copyVaultAbi } from "@/lib/contracts";
import { fixtureWallet } from "@/lib/fixtures";
import { fromUsdg, toUsdg } from "@/lib/usdg";
import { useVaultConnection } from "@/hooks/useVaultConnection";

const MOCK_TX =
  "0x9f1b3d5a7c9e1b3a5f7d2c9e1b3a5f8c0e4b6d9a1c3e5f7b9d2a4c6e8f0b1d";

export type FollowInput = {
  agentId: number;
  capAmount: number;
  maxSlippageBps: number;
};

/**
 * Following an agent with a cap (PRD §5.2), and the balances that follow
 * from it.
 *
 * `agentIds` names the agents whose allocation this caller cares about —
 * CopyVault has no "agents I follow" view, `allocationOf` is per (user,
 * agent) pair, so the screen says which pairs to read. A page showing one
 * agent passes one id.
 *
 * What comes back per agent is `allocationOf`: principal committed, returned
 * unchanged at unfollow (PRD v2.2 §7.3). It is not the position's value, and
 * nothing here should be read as PnL — that comes from Mirrored events
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

  const liveAllocated: Record<number, number> = {};
  agentIds.forEach((id, index) => {
    const result = allocationReads.data?.[index]?.result;
    // A reverted or still-loading read is not "zero allocated" — leaving the
    // id out keeps the screen's `?? 0` from asserting an unfollow that the
    // chain never reported.
    if (typeof result === "bigint") liveAllocated[id] = fromUsdg(result);
  });

  const allocatedByAgent = live ? liveAllocated : mockAllocated;
  const freeBalance = live ? fromUsdg(freeRead.data ?? BigInt(0)) : mockFreeBalance;

  async function follow(input: FollowInput): Promise<{ txHash: string }> {
    const { agentId, capAmount, maxSlippageBps } = input;
    const alreadyFollowing = (allocatedByAgent[agentId] ?? 0) > 0;

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
      setMockAllocated((current) => ({ ...current, [agentId]: capAmount }));
      setMockFreeBalance((balance) => balance - capAmount);
      return { txHash: MOCK_TX };
    }

    const txHash = await writeContractAsync({
      address: addresses.copyVault,
      abi: copyVaultAbi,
      functionName: "follow",
      // maxSlippageBps is basis points, not a USDG amount — no unit
      // conversion, unlike the cap beside it.
      args: [BigInt(agentId), toUsdg(capAmount), BigInt(maxSlippageBps)],
    });
    await confirm(txHash);
    await Promise.all([freeRead.refetch(), allocationReads.refetch()]);
    return { txHash };
  }

  function addFreeBalance(amount: number) {
    if (live) {
      void freeRead.refetch();
      return;
    }
    setMockFreeBalance((balance) => balance + amount);
  }

  /** Withdraw's counterpart to addFreeBalance — same bridge, opposite direction. */
  function subtractFreeBalance(amount: number) {
    if (live) {
      void freeRead.refetch();
      return;
    }
    setMockFreeBalance((balance) => balance - amount);
  }

  return { allocatedByAgent, freeBalance, follow, addFreeBalance, subtractFreeBalance };
}
