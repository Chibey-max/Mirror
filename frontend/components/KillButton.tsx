"use client";

import { useState } from "react";
import type { WriteProgress } from "@/hooks/useVaultConnection";
import { txUrl } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";
import { describeWriteError } from "@/lib/writeErrors";

type Stage = "idle" | "confirming" | "signing" | "pending" | "killed" | "error";

/**
 * Kill switch (design prompt §10, PRD acceptance criterion): confirm →
 * signing → pending → a solid "This agent can no longer move your funds"
 * badge, backed by a *fresh* contract read, not optimistic UI. The caller
 * owns the actual read-after-write, this component just renders the state
 * machine and calls back into it.
 *
 * `onKill` is CopyVault.unfollow() and `verify` is a fresh read of the
 * chain, neither is optimistic, and the badge waits for both.
 */
export function KillButton({
  agentName,
  allocatedAmount,
  onKill,
  verify,
}: {
  agentName: string;
  allocatedAmount: number;
  /** Resolves once the unfollow's receipt is in; reports the hash as soon
   *  as the transaction is submitted. */
  onKill: (onProgress?: WriteProgress) => Promise<{ txHash: string }>;
  /** Re-reads PolicyModule.getPolicy() after the tx confirms. Must resolve
   * true only once the chain itself confirms the follow is inactive. */
  verify: () => Promise<boolean>;
}) {
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();

  async function handleConfirm() {
    setStage("signing");
    try {
      const { txHash: hash } = await onKill((event) => {
        if (event.stage !== "submitted") return;
        setTxHash(event.txHash);
        setStage("pending");
      });
      setTxHash(hash);

      // Only now is the unfollow mined, so the reads below see its effect.
      const confirmed = await verify();
      if (!confirmed) {
        setErrorMessage(
          "The unfollow was mined, but the chain still shows this follow as active. Check the vault page before trying again.",
        );
      }
      setStage(confirmed ? "killed" : "error");
    } catch (error) {
      const failure = describeWriteError(error);
      if (failure.cancelled) {
        setStage("confirming");
        return;
      }
      setErrorMessage(failure.message);
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
          Kill {agentName}&apos;s follow and release your funds? Your{" "}
          {allocatedAmount.toFixed(2)} USDG principal returns to your free
          balance immediately. Unfollow always returns exactly what you put
          in, never a mark-to-market.
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
        Kill didn&apos;t confirm. Try again
      </MetalButton>
    );
  }

  return (
    <MetalButton
      tone="danger"
      fullWidth
      onClick={() => setStage("confirming")}
    >
      Kill follow · release principal
    </MetalButton>
  );
}
