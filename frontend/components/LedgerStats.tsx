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
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          style={{ animationDelay: `${index * 70}ms` }}
          className="group bg-[#09090a] px-4 py-3.5 transition-colors duration-200 hover:bg-[#0f0f12] motion-safe:animate-[statIn_0.5s_cubic-bezier(0.16,1,0.3,1)_backwards]"
        >
          <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted transition-colors duration-200 group-hover:text-accent">
            {stat.label}
          </dt>
          <dd className="tabular mt-1.5 text-xl font-semibold transition-transform duration-300 ease-out group-hover:translate-x-0.5">{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
