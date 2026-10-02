"use client";

import { useId, useState } from "react";
import { capForTrades, tradeUnit, tradesForCap } from "@/lib/capPrefs";

const MAX_TRADES = 99;
const SUGGESTED = [
  { trades: 1, label: "One trade" },
  { trades: 2, label: "Two a day" },
] as const;

/**
 * Sizing a cap in trades instead of dollars: the two suggestions, or any
 * number of trades a day. Each choice sets the dollar cap to that many of the
 * agent's largest trades.
 *
 * The count is a way to choose the cap, not a limit of its own: PolicyModule
 * enforces dollars per day, so when the agent trades smaller than its
 * largest, a few more copies fit. The note under the stepper says so.
 */
export function TradesPicker({
  agentName,
  largestBuyUsd,
  cap,
  onPick,
  extra,
}: {
  agentName: string;
  largestBuyUsd?: number;
  /** The cap currently entered, to show which choice it matches. */
  cap: number | undefined;
  onPick: (cap: number) => void;
  /** Another chip in the same row, e.g. Max. Built with `chipClass`. */
  extra?: React.ReactNode;
}) {
  const unit = tradeUnit(largestBuyUsd);
  const count = cap !== undefined ? tradesForCap(cap, largestBuyUsd) : 0;
  const exact = cap !== undefined && count > 0 && cap === capForTrades(count, largestBuyUsd);
  // Open when the visitor opened it, or when the cap is a custom count of
  // trades. Derived, not stored once: the agent's trade size and the saved
  // cap both arrive after the first render.
  const [openChoice, setOpenChoice] = useState<boolean | null>(null);
  const customOpen = openChoice ?? (exact && count > SUGGESTED.length);
  // The stepper's count when the cap isn't a whole number of trades.
  const [loose, setLoose] = useState(3);
  const custom = exact ? count : loose;
  const stepperId = useId();

  const customActive = customOpen;

  function pickCustom(next: number) {
    const trades = Math.max(1, Math.min(MAX_TRADES, Math.round(next) || 1));
    setLoose(trades);
    onPick(capForTrades(trades, largestBuyUsd));
  }

  const chip = chipClass;

  return (
    <div role="group" aria-label="Size the cap in trades a day" className="mt-2">
      <div className="flex flex-wrap gap-2">
        {SUGGESTED.map(({ trades, label }) => {
          const active = !customOpen && exact && count === trades;
          return (
            <button
              key={trades}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setOpenChoice(false);
                onPick(capForTrades(trades, largestBuyUsd));
              }}
              className={chip(active)}
            >
              {label}
              <span className="ml-1.5 font-mono tabular-nums text-[11px] opacity-80">
                ${capForTrades(trades, largestBuyUsd).toLocaleString("en-US")}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          aria-expanded={customOpen}
          aria-controls={stepperId}
          onClick={() => {
            const opening = !customOpen;
            setOpenChoice(opening);
            if (opening) pickCustom(custom > SUGGESTED.length ? custom : 3);
          }}
          className={chip(customActive)}
        >
          Custom
          <svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            aria-hidden="true"
            className={`ml-1.5 inline-block transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${customOpen ? "rotate-180" : ""}`}
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {extra}
      </div>

      {/* Opens by easing its row height from 0, not by popping in. */}
      <div
        id={stepperId}
        className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          customOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-3 rounded-2xl border border-border p-3">
            <div className="flex items-center justify-between gap-3">
              <StepButton label="One trade fewer" disabled={custom <= 1} onClick={() => pickCustom(custom - 1)}>
                −
              </StepButton>
              <label className="flex min-w-0 flex-1 flex-col items-center">
                <span className="sr-only">Trades a day</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_TRADES}
                  value={custom}
                  tabIndex={customOpen ? 0 : -1}
                  onChange={(event) => pickCustom(Number(event.target.value))}
                  className="w-16 appearance-none bg-transparent text-center font-display text-3xl leading-none tabular-nums text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="mt-0.5 whitespace-nowrap font-display text-sm italic text-muted">
                  {custom === 1 ? "trade a day" : "trades a day"}
                </span>
              </label>
              <StepButton label="One trade more" disabled={custom >= MAX_TRADES} onClick={() => pickCustom(custom + 1)}>
                +
              </StepButton>
            </div>
            <p className="mt-2 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              Cap{" "}
              <span className="tabular-nums text-text">
                ${capForTrades(custom, largestBuyUsd).toLocaleString("en-US")}
              </span>{" "}
              · {custom} × ${unit}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Sized on {agentName}&rsquo;s largest trade. The vault enforces the dollar cap, so on
              days it trades smaller, a few more copies fit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The chip style, for anything sitting in the same row. */
export function chipClass(active: boolean) {
  return `rounded-full border px-3.5 py-1.5 text-xs transition-[background-color,border-color,color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
    active
      ? "border-accent/40 bg-[var(--row-hover)] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_6px_14px_-10px_var(--panel-hover-shadow)]"
      : "border-border text-muted hover:border-accent/30 hover:text-text"
  }`;
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 flex-none place-items-center rounded-full border border-border text-lg leading-none text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-[border-color,transform,opacity] duration-300 hover:border-accent/40 active:scale-95 disabled:opacity-35 disabled:hover:border-border"
    >
      {children}
    </button>
  );
}
