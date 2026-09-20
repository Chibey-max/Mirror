"use client";

import { useState } from "react";
import { txUrl } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";

type Stage = "idle" | "signing" | "pending" | "success";

/**
 * Withdraw flow (design prompt §11): amount + Max (free balance only), a
 * disabled button with an inline message once the amount exceeds free
 * balance — never a silent clamp. Free balance only; allocated funds must go
 * through KillButton first, per CopyVault's design (PRD §4.4).
 *
 * TODO(Day 13+): wire `onWithdraw` to CopyVault.withdraw() via wagmi's
 * useWriteContract instead of the resolved-promise stand-in.
 */
export function WithdrawModal({
  open,
  onClose,
  freeBalance,
  onWithdraw,
}: {
  open: boolean;
  onClose: () => void;
  freeBalance: number;
  onWithdraw: (amount: number) => Promise<{ txHash: string }>;
}) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();

  if (!open) return null;

  const parsed = Number(amount);
  const overFree = amount !== "" && parsed > freeBalance;
  const invalid = amount === "" || Number.isNaN(parsed) || parsed <= 0 || overFree;

  async function handleWithdraw() {
    setStage("signing");
    try {
      const { txHash: hash } = await onWithdraw(parsed);
      setTxHash(hash);
      setStage("pending");
      // TODO(Day 13+): await the real receipt instead of a fixed delay.
      await new Promise((r) => setTimeout(r, 600));
      setStage("success");
    } catch {
      setStage("idle");
    }
  }

  function handleClose() {
    setAmount("");
    setStage("idle");
    setTxHash(undefined);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 backdrop-blur-sm sm:items-center">
      <div className="animate-[sheetUp_0.2s_ease-out] w-full max-w-sm panel rounded-t-3xl p-6 sm:rounded-3xl">
        {stage === "success" ? (
          <>
            <p className="text-sm font-medium text-accent">Done</p>
            <h2 className="mt-2 text-lg font-semibold text-text">
              {parsed.toFixed(2)} USDG withdrawn
            </h2>
            {txHash && (
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                {txHash.slice(0, 6)}…{txHash.slice(-4)} ↗
              </a>
            )}
            <MetalButton
              tone="primary"
              fullWidth
              className="mt-5"
              onClick={handleClose}
            >
              Done
            </MetalButton>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">Withdraw</h2>
              <MetalButton
                tone="quiet"
                size="icon-sm"
                onClick={handleClose}
                aria-label="Close"
              >
                ✕
              </MetalButton>
            </div>

            <p className="mt-1 text-sm text-muted">
              Free {freeBalance.toFixed(2)} USDG
            </p>

            {freeBalance === 0 ? (
              <p className="mt-4 field rounded-2xl p-3 text-sm text-muted">
                Nothing to withdraw yet. Allocated funds must be released
                with the kill switch before they can be withdrawn.
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2 field rounded-full px-4 py-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="tabular w-full bg-transparent text-lg text-text outline-none placeholder:text-muted"
                  />
                  <span className="text-sm text-muted">USDG</span>
                  <MetalButton
                    tone="quiet"
                    size="sm"
                    onClick={() => setAmount(String(freeBalance))}
                  >
                    Max
                  </MetalButton>
                </div>

                {overFree && (
                  <p className="mt-2 text-xs text-loss">
                    Max withdrawable is {freeBalance.toFixed(2)} USDG.
                  </p>
                )}

                <MetalButton
                  tone="primary"
                  size="lg"
                  fullWidth
                  className="mt-5"
                  disabled={invalid || stage !== "idle"}
                  onClick={handleWithdraw}
                >
                  {stage === "signing"
                    ? "Confirm in your wallet…"
                    : stage === "pending"
                      ? "Pending on-chain…"
                      : "Withdraw"}
                </MetalButton>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
