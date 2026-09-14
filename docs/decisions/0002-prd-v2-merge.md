# 0002 — PRD v2.0: merged with contracts-team review, gaps closed

**Status:** Decided · **Owner:** Patrick · **Date:** 14 Sep 2026

## Decision

Adopt Isaac's 14 Sep contract review (hackmd) in full, resolve the two items it left open
(oracle trust, slippage enforcement), and fold everything into `Mirror-PRD-v2.pdf` as the new
single source of truth, superseding `Mirror-PRD.pdf` (v1.0, 11 Sep).

## What changed and why

1. **`checkAndConsume` must revert, not return `bool`.** Confirmed no frontend change needed —
   `usePolicyError` already assumed revert-based decoding.
2. **`PolicyModule.setVault()`** added to break the constructor circular dependency between
   PolicyModule and CopyVault. One-time-settable, admin-gated.
3. **`TrackRecord` gets an immutable `AgentRegistry` reference** — closes both "agent doesn't
   exist" and "agent is inactive" in one check inside `recordFill`, per the actual synthesis of
   Isaac's Gap 3 and Gap 4 (he listed them separately; they're the same fix).
4. **`fillCountByAgent(uint256)` and `followerCountOf(uint256)`** added — real gaps, PRD §5.2
   needs per-agent counts and neither existed.
5. **Oracle trust: Option A adopted**, formalized — TrackRecord trusts the Runner's
   price/oracleRoundId verbatim, bounded by the existing `onlyRunner` modifier. Documented
   explicitly rather than left implicit.
6. **`notional` unit formula defined**: `size * price / 10^(tokenDecimals + 2)` for an 8-decimal
   price feed and 6-decimal USDG, worked example included. This was never written down anywhere
   and both sides need it identically.
7. **Slippage: not enforced in V1**, decided rather than left open. The mirror-at-recorded-price
   architecture has no execution-delay window for `maxSlippageBps` to protect against — it stays
   in the UI and the struct as a stored, displayed value only.
8. **`mirrorFill` per-follower isolation via try/catch** — the original spec never said what
   happens when one follower's cap-check fails mid-loop; without isolation, one over-cap
   follower would revert everyone's mirror for that fill.
9. **Found while resolving #6**: `usePolicyError.ts`'s `decode()` was converting `CapExceeded`'s
   raw 6-decimal bigint straight to `Number()` with no `formatUnits` conversion — would have
   rendered "$80000000" instead of "$80" the first time a real revert decoded. Fixed alongside
   this doc, not left for later.
10. **Timeline weekday labels were off by one throughout the 21-day plan** — confirmed against
    the actual calendar (`date -d`), not just Isaac's spot-corrections. Full table rebuilt in
    `Mirror-PRD-v2.pdf` §4, including which days are genuinely the three weekends in the window
    (they shift too, not just the labels).

## Where this lives

`Mirror-PRD-v2.pdf` (produced same session) is the complete, standalone replacement — not a
diff document. Section 6 (Frozen ABI) is the part that matters for the Day-4 implementation
work landing today.
