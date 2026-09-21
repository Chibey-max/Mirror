/**
 * "2 min ago" from a block timestamp, matching the tape's own copy.
 *
 * Rendered on the client only (the fills it describes are client-side
 * reads), so `Date.now()` here can't produce a server/client mismatch.
 */
/**
 * The spent-today bar's fill colour, as a function of spent/cap — briefing
 * §09.G: under 60% reads as unremarkable, 60–85% is a heads-up, 85%+ is the
 * agent close to being unable to buy again today. Exact-at-cap is a normal,
 * allowed state (§7.5: sells still pass once the cap is hit), never styled
 * as an error.
 */
export function spentTodayTier(pct: number): string {
  if (pct >= 85) return "bg-loss";
  if (pct >= 60) return "bg-warn";
  return "bg-accent";
}

export function relativeTime(timestampSeconds: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(now / 1000) - timestampSeconds);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
