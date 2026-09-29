"use client";

import { useBlockNumber } from "wagmi";
import { targetChain } from "@/lib/chains";
import { Badge } from "@/components/Badge";
import { InfoTooltip } from "@/components/Copyable";

/**
 * "✓ {N} fills · 0 edits · verified through block #{X}", the abstract
 * verifiability claim made concrete, computed client-side from TrackRecord
 * events only (PRD §10 improvement #3). No contract read of its own; the
 * caller passes fillCount/verifiedThroughBlock from whatever already read
 * the tape (useFillEvents once wired, fixtures until then).
 */
export function TrustBadge({ fillCount }: { fillCount: number }) {
  // The chain's own latest block, not a number typed into the page: the
  // tape above is read through it. Blank until the first read lands.
  const { data: block } = useBlockNumber({ chainId: targetChain.id, watch: true });
  const through = block === undefined ? "…" : Number(block).toLocaleString();
  return (
    <div className="inline-flex items-center gap-2">
      <Badge variant="verified">
        {/* Shorter on a phone, where the full sentence wrapped into a
            two-line pill. */}
        <span className="sm:hidden">
          ✓ {fillCount} fills · 0 edits · block #{through}
        </span>
        <span className="hidden sm:inline">
          ✓ {fillCount} fills · 0 edits · verified through block #{through}
        </span>
      </Badge>
      <InfoTooltip text="The ledger has no edit or delete function. Fills can only be appended, so a track record cannot be revised after the fact." />
    </div>
  );
}
