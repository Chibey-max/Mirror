"use client";

import { useState } from "react";
import Link from "next/link";
import { AgentBoard } from "@/components/AgentBoard";
import { AgentTapeTable } from "@/components/AgentTapeTable";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { LedgerStats } from "@/components/LedgerStats";
import { fixtureAgents, fixtureFills } from "@/lib/fixtures";

const TABS = [
  { id: "agents", label: "Agents" },
  { id: "leaderboard", label: "Leaderboard" },
  { id: "tape", label: "Verified tape" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * The product, below the hero, the same components the real screens use, so
 * this is a preview rather than an illustration.
 *
 * Two things here are live, not pictures of controls: the tabs switch the
 * panel between the three views, and the cap slider applies a real daily cap
 * to a real fill from the tape and shows what the vault would do with it.
 * That second one is the whole product promise in one control, which no
 * amount of copy above the fold gets across.
 */
export function ProductPreview() {
  const [tab, setTab] = useState<TabId>("agents");
  const [cap, setCap] = useState(50);

  const totalFills = fixtureAgents.reduce((sum, a) => sum + a.fills, 0);
  const totalFollowers = fixtureAgents.reduce((sum, a) => sum + a.followers, 0);
  const totalVolume = fixtureAgents.reduce((sum, a) => sum + a.volumeUsd, 0);
  const pulseFills = fixtureFills.filter((f) => f.agentId === 1).slice(0, 3);

  const stats = [
    { label: "Agents live", value: fixtureAgents.length.toString() },
    { label: "Fills recorded", value: totalFills.toLocaleString("en-US") },
    { label: "Followers protected", value: totalFollowers.toString() },
    {
      label: "Mirrored volume",
      value: `$${totalVolume.toLocaleString("en-US")}`,
    },
  ];

  // The cap is applied to a real fill off the tape, priced at that fill.
  const sample = pulseFills[0];
  const notional = Number(sample.size) * Number(sample.price);
  const blocked = notional > cap;

  return (
    <div className="relative">
      {/* The signature, bloomed under the panel. */}
      <div
        aria-hidden="true"
        className="accent-glow pointer-events-none absolute -top-24 left-1/2 h-64 w-[80%] -translate-x-1/2 opacity-50 blur-3xl"
      />

      <div className="panel relative rounded-3xl">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border px-6 py-3">
          <span className="font-display text-lg">Mirror</span>
          <div className="flex items-center gap-1">
            {TABS.map(({ id, label }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-pressed={active}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                    active
                      ? "bg-white/[0.06] text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          <LedgerStats stats={stats} />

          <div className="mt-6 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                {tab === "agents"
                  ? "Agents · what they trade, what they just did"
                  : tab === "leaderboard"
                    ? "Leaderboard · ranked by PnL"
                    : "Pulse · verified tape"}
              </h3>
              <p className="mt-1.5 text-sm text-muted">
                {tab === "agents"
                  ? "Trend is cumulative PnL from mirrored fills, priced at each fill."
                  : tab === "leaderboard"
                    ? "Computed from TrackRecord and CopyVault events. No spreadsheets."
                    : "Every fill, with the block and the transaction that recorded it."}
              </p>
            </div>
            <Link
              href={tab === "tape" ? "/agents/1" : "/agents"}
              className="flex-none text-xs text-accent hover:underline"
            >
              {tab === "tape" ? "Open agent" : "All agents"} &rarr;
            </Link>
          </div>

          <div className="mt-3">
            {tab === "agents" && (
              <AgentBoard agents={fixtureAgents} fills={fixtureFills} />
            )}
            {tab === "leaderboard" && <LeaderboardTable agents={fixtureAgents} />}
            {tab === "tape" && <AgentTapeTable fills={pulseFills} />}
          </div>

          {/*
            The cap, as a control rather than a claim. Everything below is
            derived from the fill above it, so the number that gets blocked is
            a number the tape actually recorded.
          */}
          <div className="mt-8 rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Your cap, applied
                </h3>
                <p className="mt-1.5 text-sm text-muted">
                  Pulse buys{" "}
                  <span className="tabular text-text">
                    {sample.size} {sample.token}
                  </span>{" "}
                  at{" "}
                  <span className="tabular text-text">${sample.price}</span>,
                  a{" "}
                  <span className="tabular text-text">
                    ${notional.toFixed(2)}
                  </span>{" "}
                  mirror for you.
                </p>
              </div>
              {/* Label and figure on one line when this wraps under the
                  sentence on a phone; right-aligned in a column beside it
                  where there's room. */}
              <div className="flex items-baseline gap-3 sm:block sm:text-right">
                <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  Daily cap
                </div>
                <div className="tabular text-2xl font-semibold">${cap}</div>
              </div>
            </div>

            <label className="mt-4 block">
              <span className="sr-only">Daily cap for this agent, in USDG</span>
              <input
                type="range"
                min={10}
                max={120}
                step={5}
                value={cap}
                onChange={(event) => setCap(Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-2 [accent-color:var(--color-accent)]"
              />
            </label>

            <p
              className={`mt-4 rounded-xl border p-3 text-sm ${
                blocked
                  ? "border-loss/40 bg-loss/10 text-text"
                  : "border-profit/30 bg-profit/5 text-text"
              }`}
            >
              {blocked ? (
                <>
                  <span className="font-semibold text-loss">Blocked.</span> This
                  trade would take today&apos;s total for this agent to{" "}
                  <span className="tabular">${notional.toFixed(2)}</span>, over
                  your <span className="tabular">${cap}</span> daily cap. The
                  vault records the rejection and mirrors nothing.
                </>
              ) : (
                <>
                  <span className="font-semibold text-profit">Mirrored.</span>{" "}
                  <span className="tabular">${notional.toFixed(2)}</span> of
                  your <span className="tabular">${cap}</span> daily cap is
                  used. The rest stays yours, and the kill switch still returns
                  your principal.
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
