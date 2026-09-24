"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";

/**
 * Gates an action on being connected, without gating the screen around it.
 *
 * Design prompt §13: "a disconnected visitor is never blocked, browsing is
 * read-only and fine, and actions prompt the user to connect." Before this,
 * Deposit/Follow/Withdraw/Kill rendered as live buttons for a disconnected
 * visitor and failed silently at the wallet layer the moment `writeContractAsync`
 * ran with no connector, the demo fixtures made this easy to miss, since
 * they render a full "as if following" state with nobody connected at all.
 *
 * One wrapper rather than a connected check duplicated at every call site:
 * wrap the handler that opens a modal or starts a write, and it either runs
 * as normal or opens the same connect modal the header's own button uses.
 */
export function useRequireConnection() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const requireConnection = useCallback(
    (action: () => void) => {
      if (isConnected) {
        action();
        return;
      }
      openConnectModal?.();
    },
    [isConnected, openConnectModal],
  );

  return { isConnected, requireConnection };
}
