"use client";

import { useState } from "react";
import { txUrl } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";

type Stage = "idle" | "confirming" | "signing" | "pending" | "killed" | "error";

/**
 * Kill switch (design prompt §10, PRD acceptance criterion): confirm →
 * signing → pending → a solid "This agent can no longer move your funds"
 * badge, backed by a *fresh* contract read, not optimistic UI. The caller
 * owns the actual read-after-write — this component just renders the state
 * machine and calls back into it.
 *
 * TODO(Day 13+): wire `onKill` to CopyVault.unfollow() via wagmi's
 * useWriteContract, and `verify` to a fresh PolicyModule.getPolicy() read
 * (not the optimistic `killed` state alone) before showing the final badge.
 */
export function KillButton({
  agentName,
  allocatedAmount,
  onKill,
  verify,
}: {
  agentName: string;
  allocatedAmount: number;
  onKill: () => Promise<{ txHash: string }>;
  /** Re-reads PolicyModule.getPolicy() after the tx confirms. Must resolve
   * true only once the chain itself confirms the follow is inactive. */
  verify: () => Promise<boolean>;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();

  async function handleConfirm() {
    setStage("signing");
    try {
      const { txHash: hash } = await onKill();
      setTxHash(hash);
      setStage("pending");

      const confirmed = await verify();
      setStage(confirmed ? "killed" : "error");
    } catch {
      setStage("error");
    }
  }

  if (stage === "killed") {
    return (
      <div className="field rounded-2xl p-3">
        <p className="text-sm font-medium text-text">
          This agent can no longer move your funds
        </p>
        <p className="mt-1 text-xs text-muted">
          Verified on-chain just now
          {txHash && (
            <>
              {" · "}
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {txHash.slice(0, 6)}…{txHash.slice(-4)} ↗
              </a>
            </>
          )}
        </p>
      </div>
    );
  }

  if (stage === "confirming") {
    return (
      <div className="rounded-xl border border-loss/40 bg-loss/10 p-3">
        <p className="text-sm text-text">
          Stop following {agentName}? Your {allocatedAmount.toFixed(2)} USDG
          allocation returns to your free balance immediately.
        </p>
        <div className="mt-3 flex gap-2">
          <MetalButton
            tone="quiet"
            className="flex-1"
            onClick={() => setStage("idle")}
          >
            Cancel
          </MetalButton>
          <MetalButton
            tone="danger"
            className="flex-1"
            onClick={handleConfirm}
          >
            Kill follow
          </MetalButton>
        </div>
      </div>
    );
  }

  if (stage === "signing" || stage === "pending") {
    return (
      <MetalButton
        tone="quiet"
        fullWidth
        disabled
      >
        {stage === "signing" ? "Confirm in your wallet…" : "Pending on-chain…"}
      </MetalButton>
    );
  }

  if (stage === "error") {
    return (
      <MetalButton
        tone="danger"
        fullWidth
        onClick={() => setStage("confirming")}
      >
        Kill didn&apos;t confirm — try again
      </MetalButton>
    );
  }

  return (
    <MetalButton
      tone="danger"
      fullWidth
      onClick={() => setStage("confirming")}
    >
      Kill follow
    </MetalButton>
  );
}
