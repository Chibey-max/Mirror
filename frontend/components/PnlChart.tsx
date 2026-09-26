"use client";

import { useMemo, useRef, useState } from "react";
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
 * chart with range pills") and nothing on the agent page rendered at all,
 * `AgentCard`'s twelve-point Sparkline is a decoration next to a number;
 * this is the number's own evidence.
 *
 * Pills pick the range and hovering reads a point off the line, and that's
 * all (briefing §09.D: "no drawing tools, no indicators, this is a tape,
 * not TradingView"). The y-axis is never
 * forced to include zero: a losing agent's line is allowed to sit entirely
 * below it and stay there, which a zero-anchored axis would visually deny.
 */
export function PnlChart({ points }: { points: TimedPnlPoint[] }) {
  const [range, setRange] = useState<Range>("All");
  // Date.now() is impure to call during render, frozen once, at mount,
  // via the lazy initializer, rather than read fresh on every render.
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));

  const filtered = useMemo(() => {
    const seconds = RANGE_SECONDS[range];
    if (!seconds) return points;
    const cutoff = nowSeconds - seconds;
    const inRange = points.filter((p) => p.timestampSeconds >= cutoff);
    // A range with nothing in it is a real answer ("no activity in the last
    // day"), not an error, but a single point can't draw a line, so the
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
            className={`h-9 min-w-11 rounded-full border px-3 font-mono text-[11px] transition-colors sm:h-auto sm:min-w-0 sm:px-2.5 sm:py-1 ${
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

function formatPct(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatWhen(seconds: number) {
  return new Date(seconds * 1000).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The line, readable point by point: hover (or drag a finger along it) and a
 * crosshair snaps to the nearest fill with its PnL, the move since the fill
 * before it, and when it happened. Arrow keys walk the same points once the
 * chart has focus, so the readout isn't mouse-only.
 *
 * The svg stretches to the container's width (preserveAspectRatio="none"),
 * which would squash anything round, so the dots and the readout are HTML
 * laid over it, positioned in percent across and pixels down (the height is
 * fixed, so viewBox units and pixels agree vertically).
 */
function Line({ points }: { points: TimedPnlPoint[] }) {
  const width = 640;
  const height = CHART_HEIGHT;
  const pad = 12;
  const boxRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const values = points.map((p) => p.pnlPct);
  const lastIndex = points.length - 1;
  const last = values[lastIndex];
  const color = last < 0 ? "var(--color-loss)" : "var(--color-profit)";
  // Deliberately NOT `Math.min(...values, 0)`, a chart that always
  // includes zero can't show a line that stays below it the whole way,
  // which is exactly the shape a consistently losing agent has to draw.
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => (i / lastIndex) * width;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.pnlPct).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  // Only drawn when zero actually falls inside the visible range, a
  // reference a viewer can check against, not an axis the data is forced
  // to include.
  const zeroVisible = min <= 0 && max >= 0;

  const pick = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setActive(Math.round(fraction * lastIndex));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    if (event.key in step) {
      event.preventDefault();
      setActive((i) =>
        Math.min(lastIndex, Math.max(0, (i ?? lastIndex) + step[event.key])),
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : lastIndex);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const shown = active ?? lastIndex;
  const point = points[shown];
  const left = `${(shown / lastIndex) * 100}%`;
  const top = y(point.pnlPct);
  const delta = shown > 0 ? point.pnlPct - values[shown - 1] : null;
  const pointColor = point.pnlPct < 0 ? "text-loss" : "text-profit";
  // The readout sits beside the crosshair, flipping sides near either edge
  // so it never runs off the chart.
  const across = shown / lastIndex;
  const anchor =
    across > 0.62 ? "-translate-x-[calc(100%+14px)]" : "translate-x-[14px]";

  return (
    <div
      ref={boxRef}
      tabIndex={0}
      role="group"
      aria-label={`PnL chart, ${points.length} fills, ending at ${formatPct(last)}. Use the arrow keys to read each point.`}
      onPointerMove={(event) => pick(event.clientX)}
      onPointerDown={(event) => pick(event.clientX)}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setActive(null);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
      className="group/chart relative cursor-crosshair touch-pan-y select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-4 focus-visible:ring-offset-[#09090a]"
      style={{ height }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="block overflow-visible"
      >
        <defs>
          <linearGradient id="pnl-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Faint guides at the top and bottom of the range, the values
            they stand for labelled at the right edge. */}
        {[pad, height - pad].map((gy) => (
          <line
            key={gy}
            x1="0"
            y1={gy}
            x2={width}
            y2={gy}
            stroke="var(--color-border)"
            strokeOpacity="0.45"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {zeroVisible && (
          <line
            x1="0"
            y1={y(0)}
            x2={width}
            y2={y(0)}
            stroke="var(--color-border)"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* Keyed on the series so a new range draws itself in again. */}
        <g key={`${points.length}-${points[0].timestampSeconds}`}>
          <path
            d={area}
            fill="url(#pnl-chart-fill)"
            className="motion-safe:animate-[chartFade_900ms_ease-out_both]"
          />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            className="motion-safe:animate-[chartDraw_1100ms_cubic-bezier(0.16,1,0.3,1)_both]"
          />
        </g>
      </svg>

      <span className="tabular pointer-events-none absolute right-0 -translate-y-full pb-1 text-[10px] text-muted" style={{ top: pad }}>
        {formatPct(max)}
      </span>
      <span className="tabular pointer-events-none absolute right-0 pt-1 text-[10px] text-muted" style={{ top: height - pad }}>
        {formatPct(min)}
      </span>

      {/* Crosshair, only while reading a point. */}
      {active !== null && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-px bg-chrome/25"
          style={{ left }}
        />
      )}

      {/* The endpoint's live pulse, or the point being read. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-0 transition-[left,top] duration-100 ease-out"
        style={{ left, top }}
      >
        {active === null && (
          <span
            className="absolute -left-2 -top-2 size-4 rounded-full opacity-40 motion-safe:animate-ping"
            style={{ background: color }}
          />
        )}
        <span
          className={`absolute rounded-full ring-2 ring-[#09090a] transition-all duration-150 ${
            active === null ? "-left-[4px] -top-[4px] size-2" : "-left-[6px] -top-[6px] size-3"
          }`}
          style={{ background: point.pnlPct < 0 ? "var(--color-loss)" : "var(--color-profit)" }}
        />
      </span>

      {active !== null && (
        <div
          className={`pointer-events-none absolute z-10 -translate-y-1/2 whitespace-nowrap rounded-xl border border-border bg-[#0d0d10]/95 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.5)] motion-safe:animate-[tipIn_120ms_ease-out] ${anchor}`}
          style={{ left, top: Math.min(Math.max(top, 34), height - 34) }}
        >
          <p className={`tabular text-base font-semibold ${pointColor}`}>
            {formatPct(point.pnlPct)}
          </p>
          {delta !== null && (
            <p className={`tabular text-[11px] ${delta < 0 ? "text-loss" : delta > 0 ? "text-profit" : "text-muted"}`}>
              {delta > 0 ? "+" : ""}
              {delta.toFixed(2)} pts vs previous fill
            </p>
          )}
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            Fill {shown + 1} of {points.length} · {formatWhen(point.timestampSeconds)}
          </p>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {active !== null
          ? `Fill ${shown + 1} of ${points.length}, ${formatPct(point.pnlPct)}, ${formatWhen(point.timestampSeconds)}`
          : ""}
      </p>
    </div>
  );
}
