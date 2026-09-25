"use client";

import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { targetChain } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";

function shortAccount(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Minimal connector UI over Wagmi 3. Only the two supported connection
 * methods are installed: injected browser wallets and WalletConnect.
 */
export function WalletConnectButton() {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const onWrongChain = isConnected && chainId !== targetChain.id;

  if (onWrongChain) {
    return (
      <MetalButton
        tone="danger"
        onClick={() => switchChain({ chainId: targetChain.id })}
        disabled={isSwitching}
      >
        {isSwitching ? "Switching…" : "Wrong network"}
      </MetalButton>
    );
  }

  if (isConnected && address) {
    return (
      <MetalButton onClick={() => disconnect()} title="Disconnect wallet">
        <span className="tabular">{shortAccount(address)}</span>
      </MetalButton>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {connectors.map((connector) => (
        <MetalButton
          key={connector.uid}
          tone={connector.id === "injected" ? "primary" : "neutral"}
          onClick={() => connect({ connector })}
          disabled={isPending}
          title={connectError?.message}
        >
          {connector.id === "injected" ? "Browser wallet" : "WalletConnect"}
        </MetalButton>
      ))}
    </div>
  );
}
