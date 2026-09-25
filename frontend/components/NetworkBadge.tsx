"use client";

import { useAccount, useConnect, useSwitchChain } from "wagmi";
import { targetChain } from "@/lib/chains";

/**
 * Which chain you're on, and a way to change it.
 *
 * Reads the live chain rather than printing a constant: the header used to
 * say "46630" whatever the wallet was actually connected to, which is exactly
 * the state a user needs to be warned about.
 *
 * Clicking switches directly to Mirror's target network, or asks the first
 * configured connector to connect when there is no wallet yet.
 *
 * Mirror deploys to testnet only; NetworkGuard still blocks anything that
 * isn't the target chain, so this reports and routes, it doesn't override.
 */
export function NetworkBadge({ compact = false }: { compact?: boolean }) {
  const { isConnected, chain, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const onTarget = isConnected && chainId === targetChain.id;
  // wagmi returns `chain` only for chains in the config, so a wallet parked on
  // some other network gives an id and nothing else.
  const unsupported = isConnected && !chain;

  const shown = chain ?? (isConnected ? undefined : targetChain);
  const kind = shown?.testnet === false ? "Mainnet" : "Testnet";
  const label = shown
    ? `${shown.id} · ${kind}`
    : `Chain ${chainId ?? "?"} · Unsupported`;

  const dot = onTarget
    ? "bg-accent"
    : unsupported
      ? "bg-loss"
      : isConnected
        ? "bg-warn"
        : "bg-chrome-dim";

  return (
    <button
      type="button"
      disabled={isConnecting || isSwitching}
      onClick={() => {
        if (isConnected) switchChain({ chainId: targetChain.id });
        else if (connectors[0]) connect({ connector: connectors[0] });
      }}
      title={
        isConnected
          ? `Network: ${label}. Click to switch to ${targetChain.name}.`
          : `Mirror runs on ${targetChain.name}. Connect a wallet to switch networks.`
      }
      className={`tabular flex items-center gap-1.5 rounded-full text-[11px] tracking-[0.08em] transition-colors hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
        unsupported ? "text-loss" : "text-muted"
      } ${compact ? "" : "px-1"}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {compact ? (shown?.id ?? chainId ?? targetChain.id) : label}
    </button>
  );
}
