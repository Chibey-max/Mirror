"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { txUrl } from "@/lib/chains";

type Stage = "idle" | "signing" | "success" | "error";

export function FollowModal({
  open,
  onClose,
  agentId,
  agentName,
  freeBalance,
  alreadyFollowing,
  onFollow,
}: {
  open: boolean;
  onClose: () => void;
  agentId: number;
  agentName: string;
  freeBalance: number;
  alreadyFollowing: boolean;
  onFollow: (input: {
    agentId: number;
    capAmount: number;
    maxSlippageBps: number;
  }) => Promise<{ txHash: string }>;
}) {
  const [capAmount, setCapAmount] = useState("");
  const [maxSlippageBps, setMaxSlippageBps] = useState("50");
  const [stage, setStage] = useState<Stage>("idle");
  const [txHash, setTxHash] = useState<string>();
  const capId = useId();
  const slippageId = useId();

  const handleClose = useCallback(() => {
    setCapAmount("");
    setMaxSlippageBps("50");
    setStage("idle");
    setTxHash(undefined);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && stage !== "signing") {
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, open, stage]);

  if (!open) return null;

  const parsedCap = Number(capAmount);
  const parsedSlippage = Number(maxSlippageBps);
  const capOverBalance = capAmount !== "" && parsedCap > freeBalance;
  const invalid =
    alreadyFollowing ||
    capAmount === "" ||
    Number.isNaN(parsedCap) ||
    parsedCap <= 0 ||
    capOverBalance ||
    maxSlippageBps === "" ||
    Number.isNaN(parsedSlippage) ||
    parsedSlippage < 0 ||
    parsedSlippage > 10000;

  async function handleFollow() {
    setStage("signing");
    try {
      const { txHash: hash } = await onFollow({
        agentId,
        capAmount: parsedCap,
        maxSlippageBps: parsedSlippage,
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
        aria-labelledby="follow-title"
        className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-6 shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="follow-title" className="text-lg font-semibold text-text">
              Follow {agentName}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Free balance {freeBalance.toFixed(2)} USDG
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close follow"
            className="rounded-md px-2 text-xl text-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-accent/70"
          >
            x
          </button>
        </div>

        {stage === "success" ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-accent">Follow active</p>
            {txHash && (
              <a
                href={txUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-accent hover:underline"
              >
                Open follow transaction
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
            {alreadyFollowing && (
              <p className="mt-5 rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm text-accent">
                You are already following this agent.
              </p>
            )}

            <label
              htmlFor={capId}
              className="mt-5 block text-sm font-medium text-text"
            >
              Daily cap
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 focus-within:ring-2 focus-within:ring-accent/70">
                <input
                  id={capId}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={capAmount}
                  onChange={(event) => setCapAmount(event.target.value)}
                  placeholder="50.00"
                  className="tabular w-full bg-transparent text-lg text-text outline-none placeholder:text-muted"
                />
                <span className="text-sm text-muted">USDG</span>
              </div>
            </label>

            <div className="mt-2 flex flex-wrap gap-2">
              {[25, 50, 100].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={preset > freeBalance}
                  onClick={() => setCapAmount(String(preset))}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-accent/70"
                >
                  {preset} USDG
                </button>
              ))}
              <button
                type="button"
                disabled={freeBalance <= 0}
                onClick={() => setCapAmount(String(freeBalance))}
                className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition hover:text-text disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-accent/70"
              >
                Max
              </button>
            </div>

            <label
              htmlFor={slippageId}
              className="mt-4 block text-sm font-medium text-text"
            >
              Max slippage
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 focus-within:ring-2 focus-within:ring-accent/70">
                <input
                  id={slippageId}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="10000"
                  value={maxSlippageBps}
                  onChange={(event) => setMaxSlippageBps(event.target.value)}
                  className="tabular w-full bg-transparent text-lg text-text outline-none"
                />
                <span className="text-sm text-muted">bps</span>
              </div>
            </label>

            {capOverBalance && (
              <p className="mt-2 text-xs text-loss">
                Cap cannot exceed your free vault balance.
              </p>
            )}
            {parsedSlippage > 10000 && (
              <p className="mt-2 text-xs text-loss">
                Slippage cannot exceed 10000 bps.
              </p>
            )}
            {stage === "error" && (
              <p className="mt-2 text-xs text-loss">
                Follow failed. Check your wallet and try again.
              </p>
            )}

            <button
              type="button"
              disabled={invalid || stage === "signing"}
              onClick={handleFollow}
              className="mt-5 h-12 w-full rounded-xl bg-accent font-semibold text-bg transition hover:brightness-110 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-accent/70"
            >
              {stage === "signing" ? "Confirm in your wallet..." : "Follow with cap"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
