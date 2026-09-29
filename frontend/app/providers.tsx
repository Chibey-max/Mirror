"use client";

import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { TransactionsProvider } from "@/components/TransactionToasts";
import { SurfaceMotion } from "@/components/SurfaceMotion";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TransactionsProvider>
          {children}
          <SurfaceMotion />
        </TransactionsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
