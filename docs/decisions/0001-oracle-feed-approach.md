# 0001 — Oracle feed approach for the buildathon build

**Status:** Decided · **Owner:** Patrick · **Date:** 12 Sep 2026

## Decision

Use `MockAggregatorV3` (owner-settable `setPrice`) for every fill priced in the demo, on both
Robinhood Chain testnet and Arbitrum Sepolia. Do not attempt to wire a real Chainlink feed for
the 21-day build.

## Why

- **Reproducibility beats realism here.** The demo (docs/demo-script.md) depends on specific,
  repeatable numbers — a $50 cap breached by an $80 trade, Red sitting at exactly −11.7% — so the
  price feed needs to be something the Runner can pin, not something that drifts with a live
  market between rehearsals and the actual recording.
- **Availability is unconfirmed.** Nobody on the team has verified a live Chainlink deployment on
  Robinhood Chain testnet (chain 46630) actually serves the Stock Token pairs (mNVDA, mAAPL,
  mTSLA) we need. Chasing that down is real risk for zero judging-criteria upside — "smart
  contract quality" and "real problem-solving" are demonstrated by the append-only ledger and the
  policy cap, not by which price oracle backs the demo.
- **It's already the contracts team's stated fallback.** `PRD §4.5` names this exact path
  ("Use this from Day 5 by default — only swap to a real RH feed if a real feed is confirmed
  live"), so this decision formalizes rather than changes plan.

## What this means for the frontend

- `TrackRecord.Fill.price` and every UI price is sourced from whatever `MockAggregatorV3` was set
  to at fill time — treated as ground truth, no separate live-price fetch anywhere in the app.
- `frontend/lib/fixtures.ts` prices (e.g. mNVDA @ $128.41) match the values `docs/claude-design-prompt.md`
  specifies, so switching from fixtures to a real contract read later changes *where* the number
  comes from, not what it is.

## Revisit if

- The Grants-track 30-day roadmap milestone ("real Chainlink feeds for 3+ Stock Tokens") is
  actually picked up post-submission — this decision is explicitly scoped to the buildathon
  window only, not the roadmap in README.md.
