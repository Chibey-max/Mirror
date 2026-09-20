/**
 * Ruled cells, like the header of a statement.
 *
 * The rules are the container's own background showing through a 1px gap, so
 * they stay correct at two columns or four without per-cell border
 * bookkeeping. Labels are mono and tracked; values are tabular so digits line
 * up cell to cell.
 */
export function LedgerStats({
  stats,
  className = "",
}: {
  stats: ReadonlyArray<{ label: string; value: string }>;
  className?: string;
}) {
  return (
    <dl
      className={`grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4 ${className}`}
    >
      {stats.map((stat) => (
        <div key={stat.label} className="bg-[#09090a] px-4 py-3.5">
          <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            {stat.label}
          </dt>
          <dd className="tabular mt-1.5 text-xl font-semibold">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
