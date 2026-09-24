"use client";

import { useCallback, useState } from "react";
import {
  type Abi,
  type Hex,
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
} from "viem";
import { useAccount, useWatchContractEvent } from "wagmi";
import type { PolicyRejectReason } from "@/components/PolicyRejectBanner";
import { addressesFor, copyVaultAbi, isDeployed } from "@/lib/contracts";
import { fromUsdg } from "@/lib/usdg";

/**
 * The PolicyModule + CopyVault user-facing custom errors (PRD §4.3/§4.4/§4.6),
 * hand-kept in sync with IPolicyModule.sol and ICopyVault.sol. The frontend
 * doesn't depend on the contracts workspace at all, this fragment is a
 * deliberate duplicate, not an import, so the two workspaces stay
 * independently buildable. If either interface's errors change
 * post-ABI-freeze, that's a whole-team sync (contracts/README.md) and this
 * array is part of it.
 *
 * These decode for real even though CopyVault.sol isn't implemented yet
 * (Jason), decoding only needs the error shape, which is frozen.
 */
const policyErrorsAbi = [
  {
    // attempted = spentToday + notional, a RUNNING TOTAL, not this trade's
    // size (PRD v2.2 §7.6). The banner copy depends on that distinction.
    type: "error",
    name: "CapExceeded",
    inputs: [
      { name: "attempted", type: "uint256" },
      { name: "cap", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "TokenNotAllowed",
    inputs: [{ name: "token", type: "address" }],
  },
  { type: "error", name: "PolicyInactive", inputs: [] },
  { type: "error", name: "OnlyVault", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
] as const satisfies Abi;

/** Maps a decoded token address to the symbol PolicyRejectBanner renders. */
export type TokenSymbolResolver = (token: `0x${string}`) => string;

/** Shapes one decoded error name + args into the banner's reason union. */
function toReason(
  errorName: string,
  args: readonly unknown[] | undefined,
  resolveSymbol?: TokenSymbolResolver,
): PolicyRejectReason | null {
  switch (errorName) {
    case "CapExceeded": {
      // Both are raw 6-decimal USDG, going straight to Number() here once
      // rendered a $80 cap breach as "$80000000", and only the fixture path
      // (already human-scale) hid it.
      const [attempted, cap] = (args ?? []) as [bigint, bigint];
      return {
        type: "CapExceeded",
        attempted: fromUsdg(attempted),
        cap: fromUsdg(cap),
      };
    }
    case "TokenNotAllowed": {
      const [token] = (args ?? []) as [Hex];
      return { type: "TokenNotAllowed", token: resolveSymbol?.(token) ?? token };
    }
    case "PolicyInactive":
      return { type: "PolicyInactive" };
    case "InsufficientBalance":
      return { type: "InsufficientBalance" };
    default:
      // OnlyVault is access control, never user-facing, no banner copy for it.
      return null;
  }
}

/**
 * Decodes the raw `reason` bytes carried by a MirrorRejected log.
 *
 * This is the path that matters after PRD v2.2 §7.1: a policy rejection
 * inside mirrorFill is caught by the vault and logged, so no transaction ever
 * reverts with one. The bytes are exactly what checkAndConsume reverted with,
 * so the same policyErrorsAbi decodes them.
 */
export function decodePolicyReason(
  reason: Hex,
  resolveSymbol?: TokenSymbolResolver,
): PolicyRejectReason | null {
  try {
    const decoded = decodeErrorResult({ abi: policyErrorsAbi, data: reason });
    return toReason(decoded.errorName, decoded.args, resolveSymbol);
  } catch {
    // Not one of ours (or empty bytes), the banner shows nothing rather than
    // inventing a reason.
    return null;
  }
}

/**
 * Decoding for the two ways a policy error can reach the UI.
 *
 * `decode` handles a caught revert. After §7.1 this is no longer how mirror
 * rejections arrive, but it is still live for the user's own direct calls,
 * deposit, follow, withdraw revert normally with CopyVault's errors.
 *
 * `decodeReason` handles MirrorRejected's bytes; `useMirrorRejection` below
 * is the subscription that produces them.
 *
 * `simulate` still exists for the design mock's "Simulate a mirror attempt"
 * demo control (docs/demo-script.md), it fabricates the same shape a real
 * decode would produce, so the banner and this hook don't know or care
 * whether the reason came from a real rejection or a rehearsal.
 */
export function usePolicyError(resolveSymbol?: TokenSymbolResolver) {
  const decode = useCallback(
    (error: unknown): PolicyRejectReason | null => {
      if (error && typeof error === "object" && "__fixtureReason" in error) {
        return (error as { __fixtureReason: PolicyRejectReason }).__fixtureReason;
      }

      if (!(error instanceof BaseError)) return null;

      const revert = error.walk(
        (e) => e instanceof ContractFunctionRevertedError,
      ) as ContractFunctionRevertedError | undefined;
      const data = revert?.data;
      if (!data?.errorName) return null;

      return toReason(data.errorName, data.args, resolveSymbol);
    },
    [resolveSymbol],
  );

  const decodeReason = useCallback(
    (reason: Hex) => decodePolicyReason(reason, resolveSymbol),
    [resolveSymbol],
  );

  const simulate = useCallback(
    (reason: PolicyRejectReason) => ({ __fixtureReason: reason }),
    [],
  );

  return { decode, decodeReason, simulate, policyErrorsAbi };
}

/** A rejection as the banner needs it: why, and the tx that recorded it. */
export type MirrorRejection = {
  reason: PolicyRejectReason;
  /** The SUCCESSFUL mirrorFill tx that logged it, not a reverted tx (§7.1). */
  txHash?: Hex;
  fillId?: bigint;
  agentId?: bigint;
};

/**
 * Watches CopyVault for the connected wallet's mirror rejections (PRD v2.2
 * §7.1/§10), newest wins, optionally narrowed to one agent.
 *
 * All three filtered fields are indexed on the event, so the node does the
 * filtering, not the client.
 *
 * Inert until deployments/46630.json lands, `isDeployed` gates the
 * subscription, because watching the zero address would look live while
 * never firing.
 */
export function useMirrorRejection(
  agentId?: number,
  resolveSymbol?: TokenSymbolResolver,
) {
  const { address, chainId } = useAccount();
  const vault = chainId ? addressesFor(chainId)?.copyVault : undefined;
  const [rejection, setRejection] = useState<MirrorRejection | null>(null);

  useWatchContractEvent({
    address: vault,
    abi: copyVaultAbi,
    eventName: "MirrorRejected",
    args: {
      user: address,
      ...(agentId === undefined ? {} : { agentId: BigInt(agentId) }),
    },
    enabled: !!address && isDeployed(vault),
    onLogs(logs) {
      const log = logs[logs.length - 1];
      if (!log?.args?.reason) return;
      const reason = decodePolicyReason(log.args.reason, resolveSymbol);
      if (!reason) return;
      setRejection({
        reason,
        txHash: log.transactionHash ?? undefined,
        fillId: log.args.fillId,
        agentId: log.args.agentId,
      });
    },
  });

  const clear = () => setRejection(null);

  return { rejection, clear };
}
