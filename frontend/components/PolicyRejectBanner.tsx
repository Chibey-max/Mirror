"use client";

import { useCallback } from "react";
import { useNotify } from "@/components/TransactionToasts";

/**
 * The demo centerpiece (PRD §5.3, design prompt §9). Never a generic
 * "transaction failed" message, never a raw revert string, always the exact
 * copy below, framed as the system *protecting* the user, with an explorer
 * link. Renders one of the four PolicyModule custom errors
 * (PRD §4.6):
 *
 *   CapExceeded(attempted, cap) · TokenNotAllowed(token) ·
 *   PolicyInactive() · InsufficientBalance()
 *
 * plus CopyVault's own PositionOverflow(), a per-follower refusal logged the
 * same way (PRD v2.2 amendment §6c). It's practically unreachable, but
 * without it that rejection decoded to nothing and read as "not mirrored".
 *
 * The link points at a SUCCESSFUL transaction, not a failed one: under PRD
 * v2.2 §7.1 the vault catches a policy rejection and logs MirrorRejected, so
 * the mirrorFill that carried it went through for everyone else. Hence
 * "rejected", never "reverted", the tx is the evidence, not the failure.
 */
export type PolicyRejectReason =
  | { type: "CapExceeded"; attempted: number; cap: number }
  | { type: "TokenNotAllowed"; token: string }
  | { type: "PolicyInactive" }
  | { type: "InsufficientBalance" }
  | { type: "PositionOverflow" };

/** Which contract refused it: every reason is PolicyModule's but one. */
export function enforcedBy(reason: PolicyRejectReason): string {
  return reason.type === "PositionOverflow" ? "CopyVault" : "PolicyModule";
}

export function rejectionCopy(reason: PolicyRejectReason): string {
  switch (reason.type) {
    case "CapExceeded":
      // `attempted` is spentToday + this trade, a running total, not the
      // trade's own size (PRD v2.2 §7.6). The old copy read it as the size,
      // which made a $30 trade blocked at "$70" impossible to understand.
      return `Blocked: this trade would take today's total for this agent to $${reason.attempted.toFixed(2)}, over your $${reason.cap.toFixed(2)} daily cap.`;
    case "TokenNotAllowed":
      return `Blocked: ${reason.token} isn't on the approved list for copy-trading yet.`;
    case "PolicyInactive":
      return "You're not currently following this agent (or you've already killed the follow).";
    case "InsufficientBalance":
      return "You don't have enough free balance in the vault for that.";
    case "PositionOverflow":
      return "Blocked: this buy would take your position past the largest amount the vault can record.";
  }
}

/**
 * Announces a rejection as a notification, like every other error: the
 * exact copy above as the headline, which contract enforced it, and the
 * mirrorFill transaction that logged it. It used to be a banner parked
 * under the feed until dismissed; a rejection is an event, and it clears
 * itself like one. The fill feed keeps the permanent record.
 */
export function useRejectionNotice() {
  const notify = useNotify();
  return useCallback(
    (reason: PolicyRejectReason, txHash?: string) =>
      notify({
        tone: "error",
        title: rejectionCopy(reason),
        detail: `Enforced on-chain by ${enforcedBy(reason)}`,
        txHash,
        linkLabel: "View the rejection on-chain",
      }),
    [notify],
  );
}
