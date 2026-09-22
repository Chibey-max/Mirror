"use client";

import { useState, type ReactNode } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { targetChain } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";
import { CopyableHash } from "@/components/Copyable";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/**
 * Whether a failed switch was the user saying no, as opposed to the wallet
 * being unable to add the network at all.
 *
 * Both reach us as UserRejectedRequestError: when a switch fails with 4902
 * (network unknown) wagmi tries wallet_addEthereumChain, and wraps ANY
 * failure of that in UserRejectedRequestError, including a wallet that
 * doesn't support adding networks. Only the original error underneath tells
 * them apart, so this looks below the top level for the wallet's own 4001,
 * or for wagmi's "added it, but declined the switch".
 */
function isUserCancel(error: unknown): boolean {
  let cause = (error as { cause?: unknown } | null)?.cause;
  while (cause && typeof cause === "object") {
    const { code, message } = cause as { code?: number; message?: string };
    if (code === 4001) return true;
    if (message?.includes("rejected switch after adding")) return true;
    cause = (cause as { cause?: unknown }).cause;
  }
  return false;
}

/** What a wallet's "Add network" form asks for, from the same chain definition
 *  wagmi sends to wallet_addEthereumChain, so the two can't disagree. */
const NETWORK_DETAILS = [
  { label: "Network name", value: targetChain.name },
  { label: "RPC URL", value: targetChain.rpcUrls.default.http[0] },
  { label: "Chain ID", value: String(targetChain.id) },
  { label: "Currency symbol", value: targetChain.nativeCurrency.symbol },
  {
    label: "Block explorer",
    value: targetChain.blockExplorers?.default.url ?? "",
  },
].filter((row) => row.value);

/**
 * Blocks the app whenever a connected wallet sits on the wrong chain, and
 * offers a one-click switch. Acceptance criterion (PRD §5.2): a fresh wallet on
 * Ethereum mainnet reaches chain 46630 without reading any instructions.
 *
 * A fresh wallet has never heard of chain 46630, which is the common case,
 * not the edge case (spec §2). The one button covers it: if the switch fails
 * because the network is unknown, wagmi asks the wallet to add it, then
 * switches. If the wallet can't add networks itself, the details to add it by
 * hand are right here, each one copyable.
 *
 * A disconnected visitor is never blocked, browsing is read-only and fine.
 */
export function NetworkGuard({ children }: { children: ReactNode }) {
  const { isConnected, chain, chainId } = useAccount();
  const { switchChain, isPending, error } = useSwitchChain();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const onWrongChain = isConnected && chain?.id !== targetChain.id;
  const dialogRef = useFocusTrap<HTMLDivElement>(onWrongChain);
  const cancelled = !!error && isUserCancel(error);
  const failed = !!error && !cancelled;

  return (
    <>
      {children}
      {onWrongChain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="network-guard-title"
            className="w-full max-w-md panel rounded-3xl p-6"
          >
            <p className="text-sm text-warn">Wrong network</p>
            <h2 id="network-guard-title" className="mt-2 text-xl font-semibold">
              You&apos;re on{" "}
              {chain?.name ??
                (chainId ? `chain ${chainId}` : "an unsupported chain")}
              .
            </h2>
            <p className="mt-2 text-sm text-muted">
              Mirror runs on {targetChain.name} (chain {targetChain.id}). If
              your wallet hasn&apos;t used it before, it will ask to add it
              first.
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

            {cancelled && (
              <p role="status" className="mt-3 text-sm text-muted">
                Cancelled in your wallet. Switch when you&apos;re ready.
              </p>
            )}
            {failed && (
              <p role="alert" className="mt-3 text-sm text-loss">
                Your wallet couldn&apos;t add {targetChain.name} automatically.
                Add it by hand with the details below, then switch.
              </p>
            )}

            <details
              className="mt-4 text-sm"
              open={failed || detailsOpen}
              onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            >
              <summary className="cursor-pointer text-muted hover:text-text">
                Add the network manually
              </summary>
              <dl className="mt-3 space-y-2.5">
                {NETWORK_DETAILS.map((row) => (
                  // Label above value, so a full RPC or explorer URL gets the
                  // modal's whole width instead of being clipped mid-address.
                  <div key={row.label}>
                    <dt className="text-xs text-muted">{row.label}</dt>
                    <dd className="mt-0.5 min-w-0">
                      <CopyableHash
                        value={row.value}
                        display={row.value}
                        label={`Copy ${row.label.toLowerCase()}`}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </div>
        </div>
      )}
    </>
  );
}
