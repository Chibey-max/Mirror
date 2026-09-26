"use client";

import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { targetChain } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";

type Connector = ReturnType<typeof useConnect>["connectors"][number];

/** WalletConnect keeps its product name; every wallet announces its own. */
function connectorLabel(connector: Connector): string {
  if (connector.id === "walletConnect") return "WalletConnect";
  if (connector.id === "injected") return "Browser wallet";
  return connector.name;
}

/**
 * One button per wallet the visitor can actually pick. EIP-6963 discovery
 * means a browser with three wallet extensions announces three connectors,
 * and the generic injected shim then points at whichever one won the
 * window.ethereum race, so it is dropped as a duplicate entry whenever a
 * named wallet is present. Names are deduped too: two builds of the same
 * wallet announce twice.
 */
function connectOptions(connectors: readonly Connector[]): Connector[] {
  const named = connectors.filter(
    (connector) => connector.id !== "injected" && connector.id !== "walletConnect",
  );
  const seen = new Set<string>();
  return connectors
    .filter((connector) => !(connector.id === "injected" && named.length > 0))
    .filter((connector) => {
      const label = connectorLabel(connector);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
}

function shortAccount(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Minimal connector UI over Wagmi 3. Two connection methods are configured,
 * injected and WalletConnect, but wagmi also announces one connector per
 * EIP-6963 wallet extension the visitor has installed, so the rendered list
 * is whatever that browser offers and every entry must carry its own name.
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
      {connectOptions(connectors).map((connector, index) => (
        <MetalButton
          key={connector.uid}
          tone={index === 0 ? "primary" : "neutral"}
          onClick={() => connect({ connector })}
          disabled={isPending}
          title={connectError?.message}
        >
          {connectorLabel(connector)}
        </MetalButton>
      ))}
    </div>
  );
}
