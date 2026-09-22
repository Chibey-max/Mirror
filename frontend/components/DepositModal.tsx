"use client";

import { useCallback, useEffect, useId, useState } from "react";
import type { WriteProgress } from "@/hooks/useVaultConnection";
import { txUrl } from "@/lib/chains";
import { MetalButton } from "@/components/MetalButton";
import { describeWriteError } from "@/lib/writeErrors";
import { FAUCET_AMOUNT } from "@/hooks/useDeposit";

type Stage = "idle" | "approving" | "depositing" | "success" | "error";

export function DepositModal({
  open,
  onClose,
  walletBalance,
  vaultBalance,
  onDeposit,
  onGetTestUsdg,
}: {
  open: boolean;
  onClose: () => void;
  walletBalance: number;
  vaultBalance: number;
  /** Reports the real stages as they happen, an approval that wasn't
   *  needed is never announced. */
  onDeposit: (
    amount: number,
    onProgress?: WriteProgress,
  ) => Promise<{ txHash: string }>;
  /** Testnet faucet. Offered inline when the wallet can't cover the
   *  deposit, so an empty wallet isn't a dead end. Omit it off testnet. */
  onGetTestUsdg?: () => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [minting, setMinting] = useState(false);
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

  async function handleGetTestUsdg() {
    if (!onGetTestUsdg) return;
    setMinting(true);
    try {
      await onGetTestUsdg();
      if (stage === "error") setStage("idle");
    } catch (error) {
      const failure = describeWriteError(error);
      if (!failure.cancelled) {
        setErrorMessage(failure.message);
        setStage("error");
      }
    } finally {
      setMinting(false);
    }
  }

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
    } catch (error) {
      const failure = describeWriteError(error);
      if (failure.cancelled) {
        setStage("idle");
        return;
      }
      setErrorMessage(failure.message);
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
        className="w-full max-w-md panel rounded-t-3xl p-6 sm:rounded-3xl"
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
          <MetalButton
            tone="quiet"
            size="icon-sm"
            onClick={handleClose}
            aria-label="Close deposit"
          >
            ✕
          </MetalButton>
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
            <MetalButton
              tone="primary"
              fullWidth
              className="mt-5"
              onClick={handleClose}
            >
              Done
            </MetalButton>
          </div>
        ) : (
          <>
            <label
              htmlFor={amountId}
              className="mt-5 block text-sm font-medium text-text"
            >
              Amount
              <div className="mt-2 flex items-center gap-2 field rounded-full px-4 py-2">
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
                <MetalButton
                  tone="quiet"
                  size="sm"
                  onClick={() => setAmount(String(walletBalance))}
                >
                  Max
                </MetalButton>
              </div>
            </label>

            {overWallet && (
              <p className="mt-2 text-xs text-loss">
                You only have {walletBalance.toFixed(2)} USDG available.
              </p>
            )}
            {onGetTestUsdg && (walletBalance <= 0 || overWallet) && (
              <p className="mt-2 text-xs text-muted">
                Testnet wallet running low?{" "}
                <button
                  type="button"
                  disabled={minting}
                  onClick={handleGetTestUsdg}
                  className="font-medium text-accent hover:underline disabled:opacity-60"
                >
                  {minting
                    ? "Minting test USDG..."
                    : `Get ${FAUCET_AMOUNT.toLocaleString()} test USDG`}
                </button>
              </p>
            )}
            {stage === "error" && (
              <p role="alert" className="mt-2 text-xs text-loss">
                {errorMessage}
              </p>
            )}

            <MetalButton
              tone="primary"
              size="lg"
              fullWidth
              className="mt-5"
              disabled={invalid || stage === "approving" || stage === "depositing"}
              onClick={handleDeposit}
            >
              {stage === "approving"
                ? "Approve USDG..."
                : stage === "depositing"
                  ? "Depositing..."
                  : "Approve and deposit"}
            </MetalButton>
          </>
        )}
      </div>
    </div>
  );
}
