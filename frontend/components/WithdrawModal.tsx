"use client";

import { useState } from "react";
import type { WriteProgress } from "@/hooks/useVaultConnection";
import { txUrl } from "@/lib/chains";

type Stage = "idle" | "signing" | "pending" | "success";

/**
 * Withdraw flow (design prompt §11): amount + Max (free balance only), a
 * disabled button with an inline message once the amount exceeds free
 * balance — never a silent clamp. Free balance only; allocated funds must go
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

  if (!open) return null;

  const parsed = Number(amount);
  const overFree = amount !== "" && parsed > freeBalance;
  const invalid = amount === "" || Number.isNaN(parsed) || parsed <= 0 || overFree;

  async function handleWithdraw() {
    setStage("signing");
    try {
      // "Pending" starts when the transaction has a hash, and ends when
      // onWithdraw resolves — which is when its receipt is in.
      const { txHash: hash } = await onWithdraw(parsed, (event) => {
        if (event.stage !== "submitted") return;
        setTxHash(event.txHash);
        setStage("pending");
      });
      setTxHash(hash);
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
      <div className="animate-[sheetUp_0.2s_ease-out] w-full max-w-sm rounded-t-2xl border border-border bg-surface p-6 sm:rounded-2xl">
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
            <button
              type="button"
              onClick={handleClose}
              className="mt-5 h-11 w-full rounded-xl bg-accent font-semibold text-bg transition hover:brightness-110"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text">Withdraw</h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <p className="mt-1 text-sm text-muted">
              Free {freeBalance.toFixed(2)} USDG
            </p>

            {freeBalance === 0 ? (
              <p className="mt-4 rounded-xl border border-border bg-surface-2 p-3 text-sm text-muted">
                Nothing to withdraw yet. Allocated funds must be released
                with the kill switch before they can be withdrawn.
              </p>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="tabular w-full bg-transparent text-lg text-text outline-none placeholder:text-muted"
                  />
                  <span className="text-sm text-muted">USDG</span>
                  <button
                    type="button"
                    onClick={() => setAmount(String(freeBalance))}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text"
                  >
                    Max
                  </button>
                </div>

                {overFree && (
                  <p className="mt-2 text-xs text-loss">
                    Max withdrawable is {freeBalance.toFixed(2)} USDG.
                  </p>
                )}

                <button
                  type="button"
                  disabled={invalid || stage !== "idle"}
                  onClick={handleWithdraw}
                  className="mt-5 h-12 w-full rounded-xl bg-accent font-semibold text-bg transition hover:brightness-110 disabled:opacity-40"
                >
                  {stage === "signing"
                    ? "Confirm in your wallet…"
                    : stage === "pending"
                      ? "Pending on-chain…"
                      : "Withdraw"}
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
