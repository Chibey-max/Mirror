"use client";

import { useCallback, useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { WriteProgress } from "@/hooks/useVaultConnection";
import { txUrl } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";
import { describeWriteError } from "@/lib/writeErrors";

type Stage = "idle" | "signing" | "pending" | "success";

/**
 * Withdraw flow (design prompt §11): amount + Max (free balance only), a
 * disabled button with an inline message once the amount exceeds free
 * balance, never a silent clamp. Free balance only; allocated funds must go
 * through KillButton first, per CopyVault's design (PRD §4.4).
 *
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
  /** Resolves once the withdraw's receipt is in; reports the hash as soon
   *  as the transaction is submitted. */
  onWithdraw: (
    amount: number,
    onProgress?: WriteProgress,
  ) => Promise<{ txHash: string }>;
}) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  const handleClose = useCallback(() => {
    setAmount("");
    setStage("idle");
    setTxHash(undefined);
    setErrorMessage(undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      // Not mid-transaction: closing then would hide a write still in flight.
      if (event.key === "Escape" && stage !== "signing" && stage !== "pending") {
        handleClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, open, stage]);

  if (!open) return null;

  const parsed = Number(amount);
  const overFree = amount !== "" && parsed > freeBalance;
  const invalid = amount === "" || Number.isNaN(parsed) || parsed <= 0 || overFree;

  async function handleWithdraw() {
    setErrorMessage(undefined);
    setStage("signing");
    try {
      // "Pending" starts when the transaction has a hash, and ends when
      // onWithdraw resolves, which is when its receipt is in.
      const { txHash: hash } = await onWithdraw(parsed, (event) => {
        if (event.stage !== "submitted") return;
        setTxHash(event.txHash);
        setStage("pending");
      });
      setTxHash(hash);
      setStage("success");
    } catch (error) {
      // Back to the form either way, with the reason shown unless the user
      // simply cancelled in their wallet.
      const failure = describeWriteError(error);
      setErrorMessage(failure.cancelled ? undefined : failure.message);
      setStage("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 backdrop-blur-sm sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-title"
        className="animate-[sheetUp_0.2s_ease-out] w-full max-w-sm panel panel-static rounded-t-3xl p-6 sm:rounded-3xl"
      >
        {stage === "success" ? (
          <>
            <p className="text-sm font-medium text-accent">Done</p>
            <h2 id="withdraw-title" className="mt-2 text-lg font-semibold text-text">
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
              <h2 id="withdraw-title" className="text-lg font-semibold text-text">
                Withdraw
              </h2>
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
                {errorMessage && (
                  <p role="alert" className="mt-2 text-xs text-loss">
                    {errorMessage}
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
