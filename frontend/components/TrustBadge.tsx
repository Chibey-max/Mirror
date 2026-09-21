import { Badge } from "@/components/Badge";
import { InfoTooltip } from "@/components/Copyable";

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
  return (
    <div className="inline-flex items-center gap-2">
      <Badge variant="verified">
        ✓ {fillCount} fills · 0 edits · verified through block #
        {verifiedThroughBlock.toLocaleString()}
      </Badge>
      <InfoTooltip text="The ledger has no edit or delete function. Fills can only be appended, so a track record cannot be revised after the fact." />
    </div>
  );
}
