"use client";

const MOCK_TX =
  "0xd410a9f2c5e1b3d7c9f1a3e5b7d9c1f3a5e7b9d1c3f5a7e9b1d3c5f7a9e1b3d";

/**
 * Withdraw is the mirror of deposit/follow's mock-state pattern (PRD §5.2/§5.3):
 * validate, fake a signature delay, then move balance via the two bridge
 * setters (useFollow's subtractFreeBalance, useDeposit's creditWallet) that
 * already exist for exactly this cross-hook update.
 *
 * TODO(Day 13+): wire to CopyVault.withdraw() via wagmi's useWriteContract.
 */
export function useWithdraw(
  freeBalance: number,
  subtractFreeBalance: (amount: number) => void,
  creditWallet: (amount: number) => void,
) {
  async function withdraw(amount: number): Promise<{ txHash: string }> {
    if (!Number.isFinite(amount) || amount <= 0 || amount > freeBalance) {
      throw new Error("Invalid withdraw amount");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    subtractFreeBalance(amount);
    creditWallet(amount);
    return { txHash: MOCK_TX };
  }

  return { withdraw };
}
