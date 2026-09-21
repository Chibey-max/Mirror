"use client";

import { useMemo, useState } from "react";
import type { TimedPnlPoint } from "@/lib/pnl";

type Range = "1D" | "7D" | "30D" | "All";
const RANGES: Range[] = ["1D", "7D", "30D", "All"];
const RANGE_SECONDS: Partial<Record<Range, number>> = {
  "1D": 86_400,
  "7D": 7 * 86_400,
  "30D": 30 * 86_400,
};

const CHART_HEIGHT = 176;

/**
 * The line chart design prompt §5 asks for ("a big PnL figure plus a line
 * chart with range pills") and nothing on the agent page rendered at all —
 * `AgentCard`'s twelve-point Sparkline is a decoration next to a number;
 * this is the number's own evidence.
 *
 * Pills are the only interaction (briefing §09.D: "no drawing tools, no
 * indicators — this is a tape, not TradingView"), and the y-axis is never
 * forced to include zero: a losing agent's line is allowed to sit entirely
 * below it and stay there, which a zero-anchored axis would visually deny.
 */
export function PnlChart({ points }: { points: TimedPnlPoint[] }) {
  const [range, setRange] = useState<Range>("All");
  // Date.now() is impure to call during render — frozen once, at mount,
  // via the lazy initializer, rather than read fresh on every render.
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  const filtered = useMemo(() => {
    const seconds = RANGE_SECONDS[range];
    if (!seconds) return points;
    const cutoff = nowSeconds - seconds;
    const inRange = points.filter((p) => p.timestampSeconds >= cutoff);
    // A range with nothing in it is a real answer ("no activity in the last
    // day"), not an error — but a single point can't draw a line, so the
    // chart falls back to the full series rather than rendering nothing.
    return inRange.length >= 2 ? inRange : points;
  }, [points, range, nowSeconds]);

  return (
    <div>
      <div role="group" aria-label="Chart range" className="flex items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={`rounded-full border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              range === r
                ? "border-accent/50 bg-accent/10 text-accent"
                : "border-border text-muted hover:text-text"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {filtered.length < 2 ? (
          <div
            className="flex items-center justify-center text-sm text-muted"
            style={{ height: CHART_HEIGHT }}
          >
            Not enough mirrored history yet to chart.
          </div>
        ) : (
          <Line points={filtered} />
        )}
      </div>
    </div>
  );
}

function Line({ points }: { points: TimedPnlPoint[] }) {
  const width = 640;
  const height = CHART_HEIGHT;
  const pad = 8;

  const values = points.map((p) => p.pnlPct);
  const last = values[values.length - 1];
  const color = last < 0 ? "var(--color-loss)" : "var(--color-profit)";
  // Deliberately NOT `Math.min(...values, 0)` — a chart that always
  // includes zero can't show a line that stays below it the whole way,
  // which is exactly the shape a consistently losing agent has to draw.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => (i / (points.length - 1)) * width;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.pnlPct).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  // Only drawn when zero actually falls inside the visible range — a
  // reference a viewer can check against, not an axis the data is forced
  // to include.
  const zeroVisible = min <= 0 && max >= 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={`PnL over the selected range, ending at ${last.toFixed(1)}%`}
    >
      <defs>
        <linearGradient id="pnl-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {zeroVisible && (
        <line
          x1="0"
          y1={y(0)}
          x2={width}
          y2={y(0)}
          stroke="var(--color-border)"
          strokeDasharray="3 4"
        />
      )}
      <path d={area} fill="url(#pnl-chart-fill)" />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(points.length - 1)} cy={y(last)} r="3.2" fill={color} />
    </svg>
  );
}
