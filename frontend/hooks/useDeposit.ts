"use client";

import { useState } from "react";
import { fixtureWallet } from "@/lib/fixtures";

const MOCK_TX =
  "0x7d2c9e1b3a5f8c0e4b6d9a1c3e5f7b9d2a4c6e8f0b1d3a5c7e9f1b3d5a7c9e1";

export function useDeposit() {
  const [walletBalance, setWalletBalance] = useState(fixtureWallet.walletUsdg);
  const [vaultBalance, setVaultBalance] = useState(fixtureWallet.vaultFree);

  async function deposit(amount: number): Promise<{ txHash: string }> {
    if (!Number.isFinite(amount) || amount <= 0 || amount > walletBalance) {
      throw new Error("Invalid deposit amount");
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    setWalletBalance((balance) => balance - amount);
    setVaultBalance((balance) => balance + amount);
    return { txHash: MOCK_TX };
  }

  /** Withdraw's counterpart to deposit's implicit wallet debit — credits the
   * wallet side when funds leave the vault. Mirrors addFreeBalance in
   * useFollow.ts, which bridges the same two hooks the other direction. */
  function creditWallet(amount: number) {
    setWalletBalance((balance) => balance + amount);
  }

  return { walletBalance, vaultBalance, deposit, creditWallet };
}
