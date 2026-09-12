"use client";

import { Badge } from "@/components/Badge";
import { txUrl } from "@/lib/chains";
import type { FixtureFill } from "@/lib/fixtures";

/**
 * Live activity panel (design prompt §8): "Pulse bought 0.42 mNVDA @
 * $128.41 · mirrored to your vault", each row linking straight to the
 * explorer. Balance updates driven by the same events live in the vault
 * summary, not here — this component only renders the feed.
 *
 * TODO(Day 9+, once Jason's Runner is live): swap the `fills` prop source
 * from lib/fixtures to hooks/useFillEvents, which watches CopyVault's
 * Mirrored event via wagmi's useWatchContractEvent.
 */
export function FillFeed({ fills }: { fills: FixtureFill[] }) {
  if (fills.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted">
          No mirrored activity yet. Follow an agent and its fills will land
          here.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {fills.map((fill) => (
        <li
          key={fill.id}
          className="animate-[rowIn_0.25s_ease-out] flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
        >
          <div className="flex items-center gap-3">
            <Badge variant={fill.side === "BUY" ? "buy" : "sell"}>
              {fill.side}
            </Badge>
            <p className="text-sm text-text">
              {fill.size} {fill.token}{" "}
              <span className="tabular text-muted">@ ${fill.price}</span>{" "}
              <span className="text-muted">· mirrored to your vault</span>
            </p>
          </div>

          <div className="flex flex-none items-center gap-3 text-xs text-muted">
            <span>{fill.time}</span>
            <a
              href={txUrl(fill.txHash)}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              ↗
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}
