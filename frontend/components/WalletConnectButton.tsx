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
import { themeWalletConnectModal } from "@/lib/walletConnectTheme";
import { useNotify, type NoticeTone } from "@/components/TransactionToasts";

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

/**
 * A failed connection, in words: which wallet, what went wrong, and what to
 * do next. A request closed in the wallet isn't a failure, so it reads as a
 * note rather than an error.
 */
function describeConnectError(
  error: Error,
  walletName: string,
): { title: string; detail: string; tone: NoticeTone } {
  const text = `${error.name} ${error.message} ${(error as { code?: number }).code ?? ""}`;
  if (/UserRejected|4001|reject|denied|cancel/i.test(text)) {
    return {
      tone: "info",
      title: "Connection cancelled",
      detail: `You closed the request in ${walletName}. Connect again whenever you're ready.`,
    };
  }
  if (/-32002|already pending/i.test(text)) {
    return {
      tone: "info",
      title: `Check ${walletName}`,
      detail: "A connection request is already waiting in your wallet.",
    };
  }
  if (/ConnectorNotFound|Provider not found|not installed|no provider/i.test(text)) {
    return {
      tone: "error",
      title: `${walletName} not found`,
      detail: `${walletName} isn't available in this browser. Install it, or pick WalletConnect to use a mobile wallet.`,
    };
  }
  const short = (error as { shortMessage?: string }).shortMessage ?? error.message;
  return {
    tone: "error",
    title: `Couldn't connect ${walletName}`,
    detail: short.split("\n")[0],
  };
}

function shortAccount(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** One line under each wallet's name in the menu, saying what picking it does. */
function connectorHint(connector: Connector): string {
  if (connector.id === "walletConnect") return "Scan with a mobile wallet";
  if (connector.id === "injected") return "Built into this browser";
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
  /** Which of the button's edges the menu lines up with: the right in the
   *  header (the button sits at the right of the screen), the left in the
   *  hero (it's the left of a centred pair, so centring ran off screen). */
  menuAlign?: "end" | "start";
} = {}) {
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const notify = useNotify();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const onWrongChain = isConnected && chainId !== targetChain.id;

  if (onWrongChain) {
    return (
      <MetalButton
        tone="danger"
        onClick={() =>
          switchChain(
            { chainId: targetChain.id },
            {
              onError: (error) => {
                const cancelled = /UserRejected|4001|reject|denied/i.test(
                  `${error.name} ${error.message}`,
                );
                notify(
                  cancelled
                    ? {
                        tone: "info",
                        title: "Network switch cancelled",
                        detail: `Mirror runs on ${targetChain.name}. Switch whenever you're ready.`,
                      }
                    : {
                        tone: "error",
                        title: `Couldn't switch to ${targetChain.name}`,
                        detail: "Your wallet refused the switch. Pick the network in the wallet itself, then come back.",
                      },
                );
              },
            },
          )
        }
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
        // EIP-6963 wallets announce their own icon (a data: URI); the two
        // configured connectors don't, and get a drawn one instead.
        icon: (connector as { icon?: string }).icon,
        kind: connector.id === "walletConnect" ? "walletConnect" : "browser",
        onSelect: async () => {
          if (connector.id === "walletConnect") {
            await themeWalletConnectModal(() => connector.getProvider());
          }
          connect(
            { connector },
            {
              onError: (error) =>
                notify(describeConnectError(error, connectorLabel(connector))),
            },
          );
        },
      }))}
      disabled={isPending}
    />
  );
}

type ConnectOption = {
  key: string;
  label: string;
  hint: string;
  icon?: string;
  kind: "walletConnect" | "browser";
  onSelect: () => void;
};

/** Line icons in the site's stroke style, for wallets with no icon of their own. */
function FallbackIcon({ kind }: { kind: ConnectOption["kind"] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "walletConnect" ? (
        <>
          <rect width="5" height="5" x="3" y="3" rx="1" />
          <rect width="5" height="5" x="16" y="3" rx="1" />
          <rect width="5" height="5" x="3" y="16" rx="1" />
          <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
          <path d="M12 7v3a2 2 0 0 1-2 2H7" />
          <path d="M16 12h1" />
          <path d="M12 21v-1" />
        </>
      ) : (
        <>
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </>
      )}
    </svg>
  );
}

/**
 * A single "Connect wallet" button that opens the wallets as a small menu
 * under it. Closes on a choice, Escape, or a tap anywhere else.
 *
 * Dressed like the rest of the page rather than as a bare list: a panel
 * (so it carries the same sheen, chrome rim and pointer light), a mono
 * eyebrow like every section label, each wallet in a round chrome tile like
 * the landing cards' icons, rows that slide in one after another and answer
 * the pointer, and a footer naming the chain the connection lands on.
 */
function ConnectMenu({
  options,
  disabled,
  align,
}: {
  options: ConnectOption[];
  disabled: boolean;
  align: "end" | "start";
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
          aria-label="Choose a wallet"
          className={`panel absolute top-full z-40 mt-2.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-surface shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)] motion-safe:animate-[tipIn_160ms_ease-out] ${
            align === "start" ? "left-0 origin-top-left" : "right-0 origin-top-right"
          }`}
        >
          <div className="flex items-center justify-between px-4 pb-2.5 pt-3.5">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Connect a wallet
            </p>
            {options.length > 0 && (
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-chrome-dim">
                {options.length} found
              </p>
            )}
          </div>
          <div className="mx-4 h-px bg-border" aria-hidden="true" />

          <div className="p-1.5">
            {options.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted">
                No wallet found in this browser. Install one, or open Mirror in
                your wallet app&apos;s browser.
              </p>
            )}
            {options.map((option, index) => (
              <button
                key={option.key}
                type="button"
                role="menuitem"
                style={{ animationDelay: `${60 + index * 55}ms` }}
                onClick={() => {
                  setOpen(false);
                  option.onSelect();
                }}
                className="group/opt flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-[var(--row-hover)] focus-visible:bg-[var(--row-hover)] motion-safe:animate-[rowIn_0.35s_cubic-bezier(0.16,1,0.3,1)_backwards]"
              >
                <span className="flex size-10 flex-none items-center justify-center rounded-full border border-border bg-[var(--field-bg)] text-chrome transition-[transform,border-color,color] duration-300 ease-out group-hover/opt:scale-110 group-hover/opt:border-chrome-dim group-hover/opt:text-text group-focus-visible/opt:scale-110">
                  {option.icon ? (
                    // A wallet's own announced icon, a data: URI; next/image
                    // adds nothing for a 20px inline image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={option.icon} alt="" width={20} height={20} className="size-5" />
                  ) : (
                    <FallbackIcon kind={option.kind} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-text">
                    {option.label}
                  </span>
                  <span className="block truncate text-xs text-muted">{option.hint}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="flex-none -translate-x-1 text-muted opacity-0 transition-all duration-300 ease-out group-hover/opt:translate-x-0 group-hover/opt:opacity-100 group-focus-visible/opt:translate-x-0 group-focus-visible/opt:opacity-100"
                >
                  →
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-profit" />
            {targetChain.name} &middot; {targetChain.id}
          </div>
        </div>
      )}
    </div>
  );
}
