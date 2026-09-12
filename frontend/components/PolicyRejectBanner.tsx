"use client";

import { txUrl } from "@/lib/chains";

/**
 * The demo centerpiece (PRD §5.3, design prompt §9). Never a generic
 * "transaction failed" toast, never a raw revert string — always the exact
 * copy below, framed as the system *protecting* the user, with an inline
 * explorer link to the failed tx. Renders one of the four PolicyModule
 * custom errors (PRD §4.6):
 *
 *   CapExceeded(attempted, cap) · TokenNotAllowed(token) ·
 *   PolicyInactive() · InsufficientBalance()
 */
export type PolicyRejectReason =
  | { type: "CapExceeded"; attempted: number; cap: number }
  | { type: "TokenNotAllowed"; token: string }
  | { type: "PolicyInactive" }
  | { type: "InsufficientBalance" };

function copyFor(reason: PolicyRejectReason): string {
  switch (reason.type) {
    case "CapExceeded":
      return `Blocked: this trade would move $${reason.attempted} but your daily cap for this agent is $${reason.cap}.`;
    case "TokenNotAllowed":
      return `Blocked: ${reason.token} isn't on the approved list for copy-trading yet.`;
    case "PolicyInactive":
      return "You're not currently following this agent (or you've already killed the follow).";
    case "InsufficientBalance":
      return "You don't have enough free balance in the vault for that.";
  }
}

export function PolicyRejectBanner({
  reason,
  txHash,
  onDismiss,
}: {
  reason: PolicyRejectReason;
  txHash?: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="animate-[fadeIn_0.2s_ease-out] rounded-2xl border border-loss/40 bg-loss/10 p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-loss/20 text-loss"
        >
          {/* shield icon — protecting, not failing */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2 4 5v6c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V5l-8-3Z" />
          </svg>
        </span>

        <div className="flex-1">
          <p className="text-sm font-medium text-text">{copyFor(reason)}</p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="text-loss/80">Enforced on-chain by PolicyModule</span>
            {txHash && (
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                View reverted tx ↗
              </a>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex-none text-muted transition hover:text-text"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
