"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { MetalButton } from "@/components/MetalButton";

/**
 * Wallet entry point. RainbowKit still owns the connect, account and chain
 * modals; ConnectButton.Custom only swaps its button for ours so the wallet
 * control matches every other button.
 *
 * NetworkGuard is what handles a wrong chain (PRD §5.2) — the "Wrong network"
 * state here only opens RainbowKit's chain switcher as a shortcut to it.
 */
export function WalletConnectButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        // RainbowKit's documented readiness check: render nothing interactive
        // until it has hydrated, or the button flashes the wrong state.
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {!connected ? (
              <MetalButton tone="primary" onClick={openConnectModal}>
                Connect wallet
              </MetalButton>
            ) : chain.unsupported ? (
              <MetalButton tone="danger" onClick={openChainModal}>
                Wrong network
              </MetalButton>
            ) : (
              <MetalButton onClick={openAccountModal}>
                <span className="tabular">{account.displayName}</span>
              </MetalButton>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
