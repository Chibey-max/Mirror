"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { MetalButton } from "@/components/MetalButton";
import type { PolicyRejectReason } from "@/components/PolicyRejectBanner";
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
 * Pagination (briefing §09.E): a button, not infinite scroll, a panel with
 * a sticky follow column beside it can't afford to have the kill switch
 * pushed off-screen by an autoloading feed.
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
      <ul className="flex flex-col gap-2">
        {fills.map((fill) => {
          const outcome = outcomes[fill.id];
          return (
            <li
              key={fill.id}
              className={`motion-reduce:animate-none animate-[rowIn_0.25s_ease-out] panel flex items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
                outcome?.status === "rejected" ? "border-loss/40" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>
                  {fill.side}
                </Badge>
                <div>
                  <p className="text-sm text-text">
                    {fill.size} {fill.token}{" "}
                    <span className="tabular text-muted">@ ${fill.price}</span>
                    <OutcomeTag outcome={outcome} />
                  </p>
                  {outcome?.status === "rejected" && (
                    <p className="mt-0.5 text-xs text-loss/80">
                      {reasonClause(outcome.reason)} · enforced on-chain by
                      PolicyModule
                    </p>
                  )}
                  {outcome?.status === "skipped" && (
                    <p className="mt-0.5 text-xs text-muted">{outcome.note}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-none items-center gap-3 text-xs text-muted">
                <span>{fill.time}</span>
                {fill.txHash && (
                  <a
                    href={txUrl(fill.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    ↗
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {onLoadMore && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Showing {fills.length}
            {typeof totalCount === "number" ? ` of ${totalCount}` : ""}.
          </p>
          {hasMore && (
            <MetalButton tone="quiet" size="sm" onClick={onLoadMore}>
              Load earlier fills
            </MetalButton>
          )}
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
      return `would take today's total to $${reason.attempted}, over your $${reason.cap} cap`;
    case "TokenNotAllowed":
      return `${reason.token} isn't on the approved list`;
    case "PolicyInactive":
      return "your follow wasn't active";
    case "InsufficientBalance":
      return "not enough free balance in the vault";
  }
}
