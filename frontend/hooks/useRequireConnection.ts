"use client";

import { useCallback, useEffect, useRef } from "react";
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
 * as normal or waits for a connection and then runs.
 *
 * The action is held rather than dropped in two cases. After a reload, wagmi
 * spends a few seconds restoring the remembered wallet; the header already
 * shows the address, so a click in that window must not ask the user to
 * connect a wallet that's visibly connected. And a disconnected click opens
 * the connect modal, then carries on once they connect, so Deposit doesn't
 * need pressing twice. Closing the modal without connecting drops it, so
 * nothing opens later out of nowhere.
 */
export function useRequireConnection() {
  const { isConnected, status, address } = useAccount();
  const { openConnectModal, connectModalOpen } = useConnectModal();
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isConnected && pending.current) {
      const action = pending.current;
      pending.current = null;
      action();
    }
  }, [isConnected]);

  // Closed without connecting: drop it. Keyed on the address rather than
  // wagmi's status, which reads "connecting" for a while after load even
  // with no wallet authorised at all.
  useEffect(() => {
    if (!connectModalOpen && !address) pending.current = null;
  }, [connectModalOpen, address]);

  const requireConnection = useCallback(
    (action: () => void) => {
      if (isConnected) {
        action();
        return;
      }
      pending.current = action;
      // A remembered wallet still being restored: the address is already
      // known (and in the header), so wait for it rather than asking.
      const restoring =
        !!address && (status === "reconnecting" || status === "connecting");
      if (restoring) return;
      openConnectModal?.();
    },
    [isConnected, status, address, openConnectModal],
  );

  return { isConnected, requireConnection };
}
