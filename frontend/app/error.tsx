"use client";

import { useEffect } from "react";
import { MetalButton } from "@/components/MetalButton";

// Last-resort boundary for an unexpected render error. Data-fetch failures
// already have their own retry banners; this catches everything else so a
// crash reads as a recoverable state, not a blank screen. Your funds are
// on-chain either way, which is worth saying.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="outline-none mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center px-5 sm:px-10"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
        Something went wrong
      </p>
      <h1 className="mt-3 font-display text-4xl text-text">
        This page failed to load.
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Nothing on-chain was affected: your vault, follows and caps live in
        the contracts, not in this page. Try again, or head back to the agents.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <MetalButton tone="primary" onClick={() => retry()}>
          Try again
        </MetalButton>
        <MetalButton href="/agents" tone="quiet">
          Browse agents
        </MetalButton>
      </div>
    </main>
  );
}
