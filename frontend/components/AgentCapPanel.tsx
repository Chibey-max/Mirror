"use client";

import { useId, useState } from "react";
import { FieldHint } from "@/components/FieldHint";
import { MetalButton } from "@/components/MetalButton";
import { setAgentCap, tradeUnit, useCapPrefs } from "@/lib/capPrefs";
import { TradesPicker, chipClass } from "@/components/TradesPicker";
import { describeWriteError } from "@/lib/writeErrors";

/**
 * This agent's daily cap, where the agent is.
 *
 * Not following yet, it's a saved choice: kept in this browser, it's where
 * Follow with cap starts, and it overrides the general cap from the home
 * page for this agent only.
 *
 * Following, the cap is the one on the follow, read from the chain, and
 * changing it is a real change: kill and re-follow at the new cap, two
 * wallet confirmations (see useFollow's changeCap for what carries over).
 */
export function AgentCapPanel({
  agentId,
  agentName,
  largestBuyUsd,
  followedCap,
  freeBalance,
  spentToday,
  onChangeCap,
}: {
  agentId: number;
  agentName: string;
  largestBuyUsd?: number;
  /** The cap on the live follow; 0 when not following. */
  followedCap: number;
  freeBalance: number;
  spentToday: number;
  onChangeCap: (newCap: number) => Promise<unknown>;
}) {
  const prefs = useCapPrefs();
  const own = prefs.agents[agentId];
  const general = prefs.general;
  const following = followedCap > 0;
  const inputId = useId();

  // Following: the editor opens on request. Not following: always open.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string>();

  const saved = own ?? general;
  const shown = draft ?? (following ? String(followedCap) : saved !== undefined ? String(saved) : "");
  const value = Number(shown);
  const validNumber = shown !== "" && Number.isFinite(value) && value > 0;
  const belowLargestBuy = validNumber && largestBuyUsd !== undefined && value < largestBuyUsd;
  // The principal comes back before the new follow is made, so it counts.
  const available = freeBalance + followedCap;
  const overAvailable = following && validNumber && value > available;

  function choose(next: string) {
    setDraft(next);
    setFailed(undefined);
    if (following) return;
    // Not following: the choice is saved as it's made, nothing to confirm.
    const amount = Number(next);
    if (next === "") setAgentCap(agentId, undefined);
    else if (Number.isFinite(amount) && amount > 0) setAgentCap(agentId, amount);
  }

  async function update() {
    if (!validNumber || overAvailable || value === followedCap) return;
    setBusy(true);
    setFailed(undefined);
    try {
      await onChangeCap(value);
      setAgentCap(agentId, value);
      setEditing(false);
      setDraft(null);
    } catch (error) {
      const failure = describeWriteError(error);
      // Cancelled in the wallet: back to the editor, nothing to report.
      if (!failure.cancelled) setFailed(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const source = following
    ? "Set on-chain when you followed. The vault enforces this one."
    : own !== undefined
      ? `Saved for ${agentName}. Follow with cap starts from this.`
      : general !== undefined
        ? "Your general cap from the home page."
        : `Not set yet. Pick one and it's saved for ${agentName}.`;

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-sm text-muted">
          Your daily cap
        </label>
        <p className="tabular text-sm font-semibold">
          {following
            ? `$${followedCap.toFixed(2)}`
            : saved !== undefined
              ? `$${saved.toFixed(2)}`
              : "Not set"}
        </p>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">{source}</p>

      {following && !editing && (
        <MetalButton
          tone="quiet"
          size="sm"
          className="mt-3"
          onClick={() => {
            setEditing(true);
            setDraft(String(followedCap));
          }}
        >
          Change cap
        </MetalButton>
      )}

      {(!following || editing) && (
        <div className="mt-3">
          <div className="field flex items-center gap-2 rounded-full px-4 py-2">
            <span className="text-sm text-muted">$</span>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              min="0"
              step="5"
              value={shown}
              onChange={(event) => choose(event.target.value)}
              onBlur={() => {
                if (!following) setDraft(null);
              }}
              placeholder={tradeUnit(largestBuyUsd).toFixed(2)}
              className="tabular w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
            />
            <span className="text-xs text-muted">USDG</span>
          </div>

          <TradesPicker
            agentName={agentName}
            largestBuyUsd={largestBuyUsd}
            cap={validNumber ? value : undefined}
            onPick={(cap) => choose(String(cap))}
            extra={
              !following && own !== undefined && general !== undefined && own !== general ? (
                <button
                  type="button"
                  onClick={() => {
                    setAgentCap(agentId, undefined);
                    setDraft(null);
                  }}
                  className={chipClass(false)}
                >
                  Use general (${general})
                </button>
              ) : undefined
            }
          />

          {belowLargestBuy && (
            <FieldHint>
              {agentName}&rsquo;s largest buy so far was ${largestBuyUsd?.toFixed(2)}. Below that,
              its bigger trades will be blocked rather than copied.
            </FieldHint>
          )}
          {overAvailable && (
            <FieldHint>
              You have ${available.toFixed(2)} for this follow, its ${followedCap.toFixed(2)}{" "}
              principal plus your free balance. Deposit more to go higher.
            </FieldHint>
          )}

          {following && (
            <>
              <p className="mt-3 rounded-xl border border-border bg-[var(--row-hover)] p-3 text-xs leading-relaxed text-muted">
                Two wallet confirmations: the follow is killed, returning your $
                {followedCap.toFixed(2)}, then made again at the new cap. Trades already copied
                from {agentName} stay with the old follow, so their sells won&rsquo;t be copied.
                {spentToday > 0 && (
                  <> Today&rsquo;s ${spentToday.toFixed(2)} still counts against the new cap.</>
                )}
              </p>
              {failed && <FieldHint>{failed}</FieldHint>}
              <div className="mt-3 flex gap-2">
                <MetalButton
                  tone="primary"
                  size="sm"
                  className="flex-1"
                  disabled={busy || !validNumber || overAvailable || value === followedCap}
                  onClick={update}
                >
                  {busy ? "Confirm in your wallet…" : "Update cap"}
                </MetalButton>
                <MetalButton
                  tone="quiet"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false);
                    setDraft(null);
                    setFailed(undefined);
                  }}
                >
                  Cancel
                </MetalButton>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
