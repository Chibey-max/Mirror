"use client";

import { useCallback, useEffect, useRef } from "react";
import { useAccount, useConnect } from "wagmi";

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
 * as normal or waits for the injected-wallet connection and then runs.
 *
 * The action is held rather than dropped in two cases. After a reload, wagmi
 * spends a few seconds restoring the remembered wallet; the header already
 * shows the address, so a click in that window must not ask the user to
 * connect a wallet that's visibly connected. A disconnected click starts the
 * injected connector and carries on after it succeeds, so Deposit doesn't
 * need pressing twice. A rejected or failed connection drops the action.
 */
export function useRequireConnection() {
  const { isConnected, status, address } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isConnected && pending.current) {
      const action = pending.current;
      pending.current = null;
      action();
    }
  }, [isConnected]);

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

      const injected = connectors.find((connector) => connector.id === "injected");
      const connector = injected ?? connectors[0];
      if (!connector) {
        pending.current = null;
        return;
      }
      void connectAsync({ connector }).catch(() => {
        pending.current = null;
      });
    },
    [isConnected, status, address, connectAsync, connectors],
  );

  return { isConnected, requireConnection };
}
