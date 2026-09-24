/**
 * A PnL trend line, drawn as plain SVG, no chart library for twelve points.
 *
 * The dashed rule is zero, so a line below it reads as a loss at a glance
 * without needing an axis. Scaled to include zero always, so two agents'
 * shapes stay comparable rather than each filling its own box.
 *
 * Decorative next to the number it accompanies, so it's hidden from screen
 * readers; the PnL figure beside it carries the meaning.
 */
export function Sparkline({
  id,
  series,
  width = 132,
  height = 36,
  className = "",
}: {
  /** Unique per instance, the fill gradient needs an id, and useId would
   *  force this to be a client component for nothing. */
  id: string;
  series: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (series.length < 2) return null;

  const last = series[series.length - 1];
  const color = last < 0 ? "var(--color-loss)" : "var(--color-profit)";
  const min = Math.min(...series, 0);
  const max = Math.max(...series, 0);
  const span = max - min || 1;
  const pad = 3;

  const x = (i: number) => (i / (series.length - 1)) * width;
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const line = series
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const gradientId = `spark-${id}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        y1={y(0)}
        x2={width}
        y2={y(0)}
        stroke="var(--color-border)"
        strokeDasharray="2 3"
      />
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={x(series.length - 1)} cy={y(last)} r="2.2" fill={color} />
    </svg>
  );
}
