"use client";

import { MetalButton } from "@/components/MetalButton";

/**
 * The RPC-error state every data screen needs and only /agents had
 * (briefing §07 Tier 1, design prompt §13): calm, not a toast that
 * disappears before anyone reads it, and Retry actually re-queries rather
 * than reloading the page.
 */
export function RetryBanner({
  message = "Could not load this from the chain. The RPC may be unreachable.",
  onRetry,
  className = "",
}: {
  message?: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`panel panel-static relative flex items-start gap-4 overflow-hidden rounded-2xl border-loss/35 p-5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-loss/12 to-transparent"
      />
      <span
        aria-hidden="true"
        className="relative flex size-8 flex-none items-center justify-center rounded-full border border-loss/50 text-sm font-bold text-loss"
      >
        !
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-semibold text-text">Couldn&apos;t reach the chain</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
        <MetalButton tone="quiet" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </MetalButton>
      </div>
    </div>
  );
}
