"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { copyVaultAbi, usdgAbi } from "@/lib/contracts";
import { fixtureWallet } from "@/lib/fixtures";
import { fromUsdg, toUsdg } from "@/lib/usdg";
import { useVaultConnection } from "@/hooks/useVaultConnection";

const MOCK_TX =
  "0x7d2c9e1b3a5f8c0e4b6d9a1c3e5f7b9d2a4c6e8f0b1d3a5c7e9f1b3d5a7c9e1";

/**
 * Wallet and vault balances, and the deposit that moves USDG between them
 * (PRD §5.2).
 *
 * Live, a deposit is up to two transactions: ERC-20 `approve` so CopyVault
 * can pull the funds, then `deposit` itself. The allowance is read first and
 * the approval skipped when one already covers the amount — a second deposit
 * shouldn't cost the follower a second signature.
 *
 * Both balances are read from chain and re-read after the deposit is mined,
 * never adjusted locally: the vault's own `balanceOf` is free balance, which
 * follow and withdraw also move, so anything kept in React state here would
 * drift the moment another write lands.
 *
 * Until deployments/46630.json lands the fixture path below runs instead —
 * same shape, no chain.
 */
export function useDeposit() {
  const { live, address, addresses, writeContractAsync, publicClient, confirm } =
    useVaultConnection();

  const [mockWallet, setMockWallet] = useState(fixtureWallet.walletUsdg);
  const [mockVault, setMockVault] = useState(fixtureWallet.vaultFree);

  const walletRead = useReadContract({
    address: addresses?.usdg,
    abi: usdgAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: live && !!address },
  });

  const vaultRead = useReadContract({
    address: addresses?.copyVault,
    abi: copyVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: live && !!address },
  });

  const walletBalance = live ? fromUsdg(walletRead.data ?? BigInt(0)) : mockWallet;
  const vaultBalance = live ? fromUsdg(vaultRead.data ?? BigInt(0)) : mockVault;

  async function deposit(amount: number): Promise<{ txHash: string }> {
    if (!Number.isFinite(amount) || amount <= 0 || amount > walletBalance) {
      throw new Error("Invalid deposit amount");
    }

    if (!live || !addresses || !address || !publicClient) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setMockWallet((balance) => balance - amount);
      setMockVault((balance) => balance + amount);
      return { txHash: MOCK_TX };
    }

    const raw = toUsdg(amount);
    const allowance = await publicClient.readContract({
      address: addresses.usdg,
      abi: usdgAbi,
      functionName: "allowance",
      args: [address, addresses.copyVault],
    });

    if (allowance < raw) {
      const approvalHash = await writeContractAsync({
        address: addresses.usdg,
        abi: usdgAbi,
        functionName: "approve",
        args: [addresses.copyVault, raw],
      });
      await confirm(approvalHash);
    }

    const txHash = await writeContractAsync({
      address: addresses.copyVault,
      abi: copyVaultAbi,
      functionName: "deposit",
      args: [raw],
    });
    await confirm(txHash);
    await Promise.all([walletRead.refetch(), vaultRead.refetch()]);

    // The deposit, not the approval — this is the hash the success state
    // links to the explorer.
    return { txHash };
  }

  /** Withdraw's counterpart to deposit's implicit wallet debit — credits the
   * wallet side when funds leave the vault. Mirrors addFreeBalance in
   * useFollow.ts, which bridges the same two hooks the other direction.
   * Live, the chain already knows; this only asks it again. */
  function creditWallet(amount: number) {
    if (live) {
      void walletRead.refetch();
      return;
    }
    setMockWallet((balance) => balance + amount);
  }

  return { walletBalance, vaultBalance, deposit, creditWallet };
}
