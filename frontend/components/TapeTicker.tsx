import { fixtureAgents, fixtureFills } from "@/lib/fixtures";

/**
 * The verified tape as a ticker — Mirror's own artifact, not decoration.
 *
 * Every field is a real field of a fill, newest block first. Type follows the
 * rest of the page rather than a terminal: agent names in Geist, numbers in
 * tabular mono, sides in the P&L colours. No visible label — the rows speak
 * for themselves; screen readers get one via aria-label.
 *
 * The pill's rim is a near-invisible hairline on purpose. A full chrome rim
 * on a strip this long turned into two heavy stripes that competed with the
 * buttons above it; the ends dissolve into black instead of stopping on a cap.
 *
 * Reads fixtures for now, like the rest of the landing page; it should switch
 * to useFillEvents once the TrackRecord address lands (PRD §4).
 */
export function TapeTicker({ className = "" }: { className?: string }) {
  const names = new Map(fixtureAgents.map((a) => [a.id, a.name]));
  const fills = [...fixtureFills].sort((a, b) => b.sequence - a.sequence);

  const row = (keyPrefix: string) =>
    fills.map((fill) => (
      <li
        key={`${keyPrefix}-${fill.id}`}
        className="flex items-baseline gap-2.5 whitespace-nowrap px-6"
      >
        <span className="font-medium text-text">{names.get(fill.agentId)}</span>
        <span
          className={`text-[11px] font-semibold tracking-[0.06em] ${
            fill.side === "BUY" ? "text-profit" : "text-loss"
          }`}
        >
          {fill.side}
        </span>
        <span className="tabular text-text">
          {fill.size} {fill.token}
        </span>
        <span className="tabular text-muted">@ ${fill.price}</span>
        <span className="tabular text-[11px] text-chrome-dim">
          #{fill.sequence.toLocaleString("en-US")}
        </span>
      </li>
    ));

  return (
    <div
      role="marquee"
      aria-label="Recent verified fills"
      // The fade is a mask over the whole pill — rim, face and text together
      // — so both ends dissolve rather than stopping on a hard cap.
      className={`relative h-11 w-[92vw] rounded-full border border-white/[0.06] bg-[linear-gradient(180deg,#111113_0%,#060607_100%)] [mask-image:linear-gradient(90deg,transparent,#000_9%,#000_91%,transparent)] sm:w-[86vw] ${className}`}
    >
      {/*
        Two copies of the list in one track that slides left by exactly half
        its width, so the loop is seamless. The pill's own fade handles both
        ends. The second copy is hidden from assistive tech — it's a repeat,
        not more fills.
      */}
      <div className="h-full overflow-hidden rounded-full text-[13px]">
        <div className="flex h-full w-max animate-[tape_48s_linear_infinite] items-center motion-reduce:animate-none">
          <ul className="flex">{row("a")}</ul>
          <ul className="flex" aria-hidden="true">
            {row("b")}
          </ul>
        </div>
      </div>
    </div>
  );
}
