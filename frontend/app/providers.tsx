"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, type Theme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";
import { TransactionsProvider } from "@/components/TransactionToasts";

/**
 * RainbowKit's own dark theme is a mid-grey card with its own type and radii,
 * and it landed on the page looking like a different product. Its theme is a
 * plain object, so the connect/account modals take Mirror's palette instead:
 * black panels, hairline rules, copper accent, Geist, and pill controls.
 *
 * Built from darkTheme() rather than written from scratch so any key
 * RainbowKit adds later still has a sane default.
 */
const base = darkTheme({
  accentColor: "#e2a97f",
  accentColorForeground: "#0a0b0d",
  borderRadius: "large",
  overlayBlur: "small",
});

const mirrorTheme: Theme = {
  ...base,
  fonts: {
    body: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  radii: {
    ...base.radii,
    modal: "24px",
    modalMobile: "24px",
    menuButton: "999px",
    actionButton: "999px",
    connectButton: "999px",
  },
  colors: {
    ...base.colors,
    accentColor: "#e2a97f",
    accentColorForeground: "#0a0b0d",

    // Panels: the same black face and hairline rule as .panel.
    modalBackground: "#09090a",
    modalBorder: "#2b2c31",
    modalBackdrop: "rgba(0, 0, 0, 0.72)",
    profileForeground: "#09090a",

    modalText: "#ececef",
    modalTextSecondary: "#8e9097",
    modalTextDim: "#5d5f66",

    generalBorder: "#2b2c31",
    generalBorderDim: "#1c1d21",
    actionButtonBorder: "#2b2c31",
    actionButtonBorderMobile: "#2b2c31",

    // Rows and secondary controls sit one step above the panel, like .field
    // inverted, a wallet row should read as pressable, not as a plain list.
    menuItemBackground: "#141417",
    actionButtonSecondaryBackground: "#141417",
    profileAction: "#141417",
    profileActionHover: "#1c1d21",
    closeButton: "#8e9097",
    closeButtonBackground: "#141417",
    selectedOptionBorder: "#e2a97f",

    error: "#ff4d43",
    connectButtonTextError: "#ff4d43",
    standby: "#ffb547",
  },
  shadows: {
    ...base.shadows,
    dialog: "0 32px 64px -24px rgba(0, 0, 0, 0.95)",
    profileDetailsAction: "0 2px 6px rgba(0, 0, 0, 0.6)",
    selectedWallet: "0 0 0 1px #2b2c31",
    selectedOption: "0 0 0 1px #2b2c31",
    walletLogo: "0 2px 8px rgba(0, 0, 0, 0.6)",
  },
};

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={mirrorTheme} modalSize="compact">
          <TransactionsProvider>{children}</TransactionsProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
