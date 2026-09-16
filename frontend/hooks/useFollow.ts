"use client";

import { useState } from "react";
import { fixtureWallet } from "@/lib/fixtures";

const MOCK_TX =
  "0x9f1b3d5a7c9e1b3a5f7d2c9e1b3a5f8c0e4b6d9a1c3e5f7b9d2a4c6e8f0b1d";

export type FollowInput = {
  agentId: number;
  capAmount: number;
  maxSlippageBps: number;
};

export function useFollow(initialFreeBalance: number) {
  const [allocatedByAgent, setAllocatedByAgent] = useState<Record<number, number>>(
    fixtureWallet.allocated,
  );
  const [freeBalance, setFreeBalance] = useState(initialFreeBalance);

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

    await new Promise((resolve) => setTimeout(resolve, 500));
    setAllocatedByAgent((current) => ({ ...current, [agentId]: capAmount }));
    setFreeBalance((balance) => balance - capAmount);
    return { txHash: MOCK_TX };
  }

  function addFreeBalance(amount: number) {
    setFreeBalance((balance) => balance + amount);
  }

  /** Withdraw's counterpart to addFreeBalance — same bridge, opposite direction. */
  function subtractFreeBalance(amount: number) {
    setFreeBalance((balance) => balance - amount);
  }

  return { allocatedByAgent, freeBalance, follow, addFreeBalance, subtractFreeBalance };
}
