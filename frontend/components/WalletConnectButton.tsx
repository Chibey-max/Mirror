"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

/**
 * Wallet entry point. RainbowKit's own button handles the account modal, so we
 * only override the disconnected label and keep the chain switcher hidden —
 * NetworkGuard is what handles a wrong chain (PRD §5.2).
 */
export function WalletConnectButton() {
  return (
    <ConnectButton
      label="Connect wallet"
      chainStatus="none"
      showBalance={false}
      accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
    />
  );
}
