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
      className={`rounded-2xl border border-loss/40 bg-loss/10 p-5 ${className}`}
    >
      <p className="text-sm text-loss">{message}</p>
      <MetalButton tone="quiet" size="sm" className="mt-3" onClick={onRetry}>
        Retry
      </MetalButton>
    </div>
  );
}
