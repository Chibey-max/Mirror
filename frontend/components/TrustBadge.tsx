"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";

/**
 * "✓ {N} fills · 0 edits · verified through block #{X}" — the abstract
 * verifiability claim made concrete, computed client-side from TrackRecord
 * events only (PRD §10 improvement #3). No contract read of its own; the
 * caller passes fillCount/verifiedThroughBlock from whatever already read
 * the tape (useFillEvents once wired, fixtures until then).
 */
export function TrustBadge({
  fillCount,
  verifiedThroughBlock,
}: {
  fillCount: number;
  verifiedThroughBlock: number;
}) {
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div className="relative inline-flex items-center gap-2">
      <Badge variant="verified">
        ✓ {fillCount} fills · 0 edits · verified through block #
        {verifiedThroughBlock.toLocaleString()}
      </Badge>
      <button
        type="button"
        aria-label="Why this matters"
        onClick={() => setShowWhy((v) => !v)}
        onBlur={() => setShowWhy(false)}
        className="text-muted transition hover:text-text"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-chrome-dim text-[10px] leading-none">
          i
        </span>
      </button>

      {showWhy && (
        <div className="absolute left-0 top-full z-10 mt-2 w-64 panel rounded-2xl p-3 text-xs text-muted">
          The ledger has no edit or delete function. Fills can only be
          appended, so a track record cannot be revised after the fact.
        </div>
      )}
    </div>
  );
}
