"use client";

import { useEffect, useId, useRef, useState } from "react";
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

/** One line under each wallet's name in the menu, saying what picking it does. */
function connectorHint(connector: Connector): string {
  if (connector.id === "walletConnect") return "Scan or open in a mobile wallet app";
  if (connector.id === "injected") return "The wallet built into this browser";
  return "Browser extension";
}

/**
 * Minimal connector UI over Wagmi 3. Two connection methods are configured,
 * injected and WalletConnect, but wagmi also announces one connector per
 * EIP-6963 wallet extension the visitor has installed, so the list is
 * whatever that browser offers and every entry must carry its own name.
 *
 * That list has no fixed length, so it lives behind a single "Connect
 * wallet" button rather than as a row of buttons: a visitor with three
 * extensions got four buttons, which pushed the header off a phone and broke
 * the hero's call to action into ragged rows.
 */
export function WalletConnectButton({
  menuAlign = "end",
}: {
  /** Where the menu opens: under the button's right edge (the header) or
   *  centred under it (the hero, where the button isn't at a screen edge). */
  menuAlign?: "end" | "center";
} = {}) {
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
    <ConnectMenu
      align={menuAlign}
      options={connectOptions(connectors).map((connector) => ({
        key: connector.uid,
        label: connectorLabel(connector),
        hint: connectorHint(connector),
        onSelect: () => connect({ connector }),
      }))}
      disabled={isPending}
      error={connectError?.message}
    />
  );
}

/**
 * A single "Connect wallet" button that opens the wallets as a small menu
 * under it. Closes on a choice, Escape, or a tap anywhere else.
 */
function ConnectMenu({
  options,
  disabled,
  error,
  align,
}: {
  options: { key: string; label: string; hint: string; onSelect: () => void }[];
  disabled: boolean;
  error?: string;
  align: "end" | "center";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <MetalButton
        tone="primary"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
      >
        {disabled ? "Connecting…" : "Connect wallet"}
      </MetalButton>
      {open && (
        <div
          id={menuId}
          role="menu"
          className={`panel panel-static absolute top-full z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6)] motion-safe:animate-[tipIn_140ms_ease-out] ${
            align === "center" ? "left-1/2 -translate-x-1/2" : "right-0"
          }`}
        >
          {options.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted">
              No wallet found in this browser.
            </p>
          )}
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                option.onSelect();
              }}
              className="flex w-full flex-col items-start rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05] focus-visible:bg-white/[0.05] focus-visible:outline-none"
            >
              <span className="text-sm font-semibold text-text">{option.label}</span>
              <span className="text-xs text-muted">{option.hint}</span>
            </button>
          ))}
          {error && <p className="px-3 pb-2 pt-1 text-xs text-loss">{error}</p>}
        </div>
      )}
    </div>
  );
}
