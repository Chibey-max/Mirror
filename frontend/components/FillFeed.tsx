"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@/components/Badge";
import { MetalButton } from "@/components/MetalButton";
import { Pager } from "@/components/Pager";
import { usePaged } from "@/hooks/usePaged";
import {
  enforcedBy,
  type PolicyRejectReason,
} from "@/components/PolicyRejectBanner";
import type { MirrorOutcome, MirrorOutcomes } from "@/hooks/useMirrorOutcomes";
import { txUrl } from "@/lib/chains";
import type { FixtureFill } from "@/lib/fixtures";

/**
 * Live activity panel (design prompt §8): "Pulse bought 0.42 mNVDA @
 * $128.41 · mirrored to your vault", each row linking straight to the
 * explorer. Balance updates driven by the same events live in the vault
 * summary, not here, this component only renders the feed.
 *
 * What a row says about YOUR vault comes from `outcomes`, never from the
 * fill: one fill can be mirrored for one follower, rejected for the next and
 * irrelevant to a third (PRD v2.2 §7.1). A fill with no outcome is an agent
 * trade that didn't touch you, and the row says nothing about your vault.
 *
 * `fills` comes from hooks/useFillEvents, which backfills from TrackRecord
 * and watches FillRecorded; `outcomes` from hooks/useMirrorOutcomes.
 *
 * Pagination (briefing §09.E): pages of eight, not infinite scroll, a panel
 * with a sticky follow column beside it can't afford to have the kill switch
 * pushed off-screen by an autoloading feed. Older fills not fetched yet load
 * from the last page.
 */
export function FillFeed({
  fills,
  outcomes = {},
  totalCount,
  hasMore = false,
  onLoadMore,
}: {
  fills: FixtureFill[];
  outcomes?: MirrorOutcomes;
  /** The agent's real fill count, from TrackRecord.fillCountByAgent,
   *  undefined against fixtures, where there's nothing left to page in. */
  totalCount?: number;
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  // Announce fills that land while the page is open, never the backlog that
  // was already there when it loaded, or a screen reader would read out the
  // whole tape on arrival. `sequence` is the on-chain fill id, so anything
  // above the highest one seen at first load is genuinely new. Recorded
  // during render (React's "previous render" pattern), not in an effect.
  const newestSequence = fills.reduce(
    (max, fill) => Math.max(max, fill.sequence),
    -Infinity,
  );
  const [baseline, setBaseline] = useState<number | null>(
    fills.length > 0 ? newestSequence : null,
  );
  if (baseline === null && fills.length > 0) setBaseline(newestSequence);
  const arrived =
    baseline !== null && newestSequence > baseline
      ? fills.find((fill) => fill.sequence === newestSequence)
      : undefined;
  const announcement = arrived
    ? `New fill: ${arrived.side === "BUY" ? "bought" : "sold"} ${arrived.size} ${arrived.token} at $${arrived.price}.`
    : "";
  const anchor = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const paging = usePaged(fills, 8, anchor);
  const { page, pageCount, phase, rows, paged, rowMotion } = paging;

  // Pages differ in height (a blocked fill takes two lines), so the list
  // glides to its new height instead of snapping: held at the old height
  // while rows leave, eased to the new one as they arrive, then let go.
  useLayoutEffect(() => {
    const wrap = anchor.current, list = listRef.current;
    if (!wrap || !list) return;
    if (phase === "out") {
      wrap.style.height = `${wrap.offsetHeight}px`;
    } else if (phase === "in") {
      wrap.style.height = `${list.offsetHeight}px`;
    } else {
      wrap.style.height = "";
    }
  }, [phase, page]);
  const liveRegion = (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </p>
  );

  if (fills.length === 0) {
    return (
      <div className="panel rounded-3xl p-6 text-center">
        {liveRegion}
        <p className="text-sm text-muted">
          No mirrored activity yet. Follow an agent and its fills will land
          here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {liveRegion}
      <div
        ref={anchor}
        className="overflow-hidden transition-[height] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      >
      <ul ref={listRef} className="flex flex-col gap-2 pb-1">
        {rows.map((fill, index) => {
          const outcome = outcomes[fill.id];
          const motion = rowMotion(index);
          return (
            <li
              key={`${page}-${fill.id}`}
              style={motion.style}
              className={`${motion.className} lift panel flex items-start gap-3 rounded-2xl px-4 py-3 sm:items-center ${
                outcome?.status === "rejected" ? "border-loss/40" : ""
              }`}
            >
              <span className="pop">
                <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>
                  {fill.side}
                </Badge>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text">
                  {fill.size} {fill.token}{" "}
                  <span className="tabular text-muted">@ ${fill.price}</span>
                  <OutcomeTag outcome={outcome} />
                </p>
                {outcome?.status === "rejected" && (
                  <p className="mt-0.5 text-xs text-loss/80">
                    {reasonClause(outcome.reason)} · enforced on-chain by{" "}
                    {enforcedBy(outcome.reason)}
                  </p>
                )}
                {outcome?.status === "skipped" && (
                  <p className="mt-0.5 text-xs text-muted">{outcome.note}</p>
                )}
                {/* On a phone the time and link drop under the text, a
                    right-hand column squeezed the sentence into a sliver. */}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted sm:hidden">
                  <span>{fill.time}</span>
                  {fill.txHash && (
                    <a
                      href={txUrl(fill.txHash)}
                      target="_blank"
                      rel="noreferrer"
                      className="-my-2 py-2 text-accent hover:underline"
                    >
                      Open tx ↗
                    </a>
                  )}
                </div>
              </div>

              <div className="hidden flex-none items-center gap-1 text-xs text-muted sm:flex">
                <span>{fill.time}</span>
                {fill.txHash && (
                  <a
                    href={txUrl(fill.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open transaction"
                    className="inline-flex size-8 items-center justify-center rounded-full text-accent transition-colors hover:bg-accent/10"
                  >
                    ↗
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      </div>

      {paged && (
        <div className="panel mt-3 overflow-hidden rounded-3xl">
          <Pager paging={paging} label="Live activity pages" />
        </div>
      )}
      {onLoadMore && hasMore && page === pageCount - 1 && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            {fills.length}
            {typeof totalCount === "number" ? ` of ${totalCount}` : ""} loaded
          </p>
          <MetalButton tone="quiet" size="sm" onClick={onLoadMore}>
            Load earlier
          </MetalButton>
        </div>
      )}
    </div>
  );
}

function OutcomeTag({ outcome }: { outcome?: MirrorOutcome }) {
  // No outcome: the agent traded, but nothing is known to have happened in
  // your vault, so claim nothing.
  if (!outcome) return null;

  if (outcome.status === "mirrored") {
    return <span className="text-muted"> · mirrored to your vault</span>;
  }
  if (outcome.status === "rejected") {
    return <span className="text-loss"> · blocked by your policy</span>;
  }
  return <span className="text-muted"> · not mirrored</span>;
}

/**
 * The short clause form of a rejection. PolicyRejectBanner carries the full
 * sentence for the one rejection that just happened; a feed row is a log
 * line and needs the cause, not the explanation.
 */
export function reasonClause(reason: PolicyRejectReason): string {
  switch (reason.type) {
    case "CapExceeded":
      return `would take today's total to $${reason.attempted.toFixed(2)}, over your $${reason.cap.toFixed(2)} cap`;
    case "TokenNotAllowed":
      return `${reason.token} isn't on the approved list`;
    case "PolicyInactive":
      return "your follow wasn't active";
    case "InsufficientBalance":
      return "not enough free balance in the vault";
    case "PositionOverflow":
      return "position would exceed what the vault can record";
  }
}
