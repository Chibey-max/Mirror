"use client";

import { type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { targetChain } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";

/**
 * Blocks the app whenever a connected wallet sits on the wrong chain, and
 * offers a one-click switch. Acceptance criterion (PRD §5.2): a fresh wallet on
 * Ethereum mainnet reaches chain 46630 without reading any instructions.
 *
 * A disconnected visitor is never blocked, browsing is read-only and fine.
 */
export function NetworkGuard({ children }: { children: ReactNode }) {
  const { isConnected, chain } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();

  const onWrongChain = isConnected && chain?.id !== targetChain.id;

  return (
    <>
      {children}
      {onWrongChain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md panel rounded-3xl p-6">
            <p className="text-sm text-warn">Wrong network</p>
            <h2 className="mt-2 text-xl font-semibold">
              You&apos;re on {chain?.name ?? "an unsupported chain"}.
            </h2>
            <p className="mt-2 text-sm text-muted">
              Mirror runs on {targetChain.name} (chain {targetChain.id}). Switch
              to keep going.
            </p>

            <MetalButton
              tone="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => switchChain({ chainId: targetChain.id })}
              disabled={isPending}
            >
              {isPending ? "Check your wallet…" : `Switch to ${targetChain.name}`}
            </MetalButton>

            {error && (
              <p className="mt-3 text-sm text-loss">
                Couldn&apos;t switch automatically. Add {targetChain.name} (chain{" "}
                {targetChain.id}) in your wallet, then try again.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
