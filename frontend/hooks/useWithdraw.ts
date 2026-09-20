"use client";

import { copyVaultAbi } from "@/lib/contracts";
import { toUsdg } from "@/lib/usdg";
import { useVaultConnection } from "@/hooks/useVaultConnection";

const MOCK_TX =
  "0xd410a9f2c5e1b3d7c9f1a3e5b7d9c1f3a5e7b9d1c3f5a7e9b1d3c5f7a9e1b3d";

/**
 * Withdrawing free vault balance back to the wallet (PRD §5.2/§5.3).
 *
 * Only free balance can leave: what's allocated to an agent is released by
 * unfollowing (§7.3), which is the kill button's job, not this one — so a
 * follower who wants everything out kills first, then withdraws.
 *
 * The two bridge setters do double duty. Against fixtures they move the
 * numbers; live they ask the chain to re-read, because the withdraw has
 * already moved both sides and the hooks that own those balances are the
 * ones that should say so.
 */
export function useWithdraw(
  freeBalance: number,
  subtractFreeBalance: (amount: number) => void,
  creditWallet: (amount: number) => void,
) {
  const { live, addresses, writeContractAsync, confirm } = useVaultConnection();

  async function withdraw(amount: number): Promise<{ txHash: string }> {
    if (!Number.isFinite(amount) || amount <= 0 || amount > freeBalance) {
      throw new Error("Invalid withdraw amount");
    }

    if (!live || !addresses) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      subtractFreeBalance(amount);
      creditWallet(amount);
      return { txHash: MOCK_TX };
    }

    const txHash = await writeContractAsync({
      address: addresses.copyVault,
      abi: copyVaultAbi,
      functionName: "withdraw",
      args: [toUsdg(amount)],
    });
    await confirm(txHash);
    subtractFreeBalance(amount);
    creditWallet(amount);
    return { txHash };
  }

  return { withdraw };
}
