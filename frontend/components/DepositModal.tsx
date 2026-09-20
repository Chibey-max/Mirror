"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { WriteProgress } from "@/hooks/useVaultConnection";
import { txUrl } from "@/lib/chains";

type Stage = "idle" | "approving" | "depositing" | "success" | "error";

export function DepositModal({
  open,
  onClose,
  walletBalance,
  vaultBalance,
  onDeposit,
}: {
  open: boolean;
  onClose: () => void;
  walletBalance: number;
  vaultBalance: number;
  /** Reports the real stages as they happen — an approval that wasn't
   *  needed is never announced. */
  onDeposit: (
    amount: number,
    onProgress?: WriteProgress,
  ) => Promise<{ txHash: string }>;
}) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();
  const amountId = useId();

  const handleClose = useCallback(() => {
    setAmount("");
    setStage("idle");
    setTxHash(undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && stage !== "approving" && stage !== "depositing") {
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, open, stage]);

  if (!open) return null;

  const parsed = Number(amount);
  const overWallet = amount !== "" && parsed > walletBalance;
  const invalid =
    amount === "" || Number.isNaN(parsed) || parsed <= 0 || overWallet;

  async function handleDeposit() {
    setStage("depositing");
    try {
      const { txHash: hash } = await onDeposit(parsed, (event) => {
        if (event.stage === "approving") {
          setStage("approving");
          return;
        }
        setTxHash(event.txHash);
        setStage("depositing");
      });
      setTxHash(hash);
      setStage("success");
    } catch {
      setStage("error");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-title"
        className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="deposit-title" className="text-lg font-semibold text-text">
              Deposit USDG
            </h2>
            <p className="mt-1 text-sm text-muted">
              Wallet {walletBalance.toFixed(2)} USDG - vault{" "}
              {vaultBalance.toFixed(2)} USDG
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close deposit"
            className="rounded-md px-2 text-xl text-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/70"
          >
            x
          </button>
        </div>

        {stage === "success" ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-accent">Deposited</p>
            {txHash && (
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                Open deposit transaction
              </a>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mt-5 h-11 w-full rounded-xl bg-accent font-semibold text-bg transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent/70"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <label
              htmlFor={amountId}
              className="mt-5 block text-sm font-medium text-text"
            >
              Amount
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 focus-within:ring-2 focus-within:ring-accent/70">
                <input
                  id={amountId}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  className="tabular w-full bg-transparent text-lg text-text outline-none placeholder:text-muted"
                />
                <span className="text-sm text-muted">USDG</span>
                <button
                  type="button"
                  onClick={() => setAmount(String(walletBalance))}
                  className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/70"
                >
                  Max
                </button>
              </div>
            </label>

            {overWallet && (
              <p className="mt-2 text-xs text-loss">
                You only have {walletBalance.toFixed(2)} USDG available.
              </p>
            )}
            {stage === "error" && (
              <p className="mt-2 text-xs text-loss">
                Deposit failed. Check your wallet and try again.
              </p>
            )}

            <button
              type="button"
              disabled={invalid || stage === "approving" || stage === "depositing"}
              onClick={handleDeposit}
              className="mt-5 h-12 w-full rounded-xl bg-accent font-semibold text-bg transition hover:brightness-110 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-accent/70"
            >
              {stage === "approving"
                ? "Approve USDG..."
                : stage === "depositing"
                  ? "Depositing..."
                  : "Approve and deposit"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
