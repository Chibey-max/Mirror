# Frontend UX gaps

What stands between the current frontend and a UI a stranger can operate
without being walked through it. Measured against
[the design prompt](./claude-design-prompt.md) §§1–13.

Where we are: `main` has the **behaviour** — every write is real, every read
has a live path gated on `isDeployed()`, policy rejections decode from
`MirrorRejected`, the kill verifies against chain state.
`design/glass-direction` has the **surface** — header, hero, metal controls,
ledger palette, masthead, sparkline, agent board, ticker.

What neither has is the connective tissue between them. That's this list.

Items are grouped by what their absence costs, not by size. Anything marked
**blocked** needs someone outside the frontend.

---

## Tier 1 — a user can't finish a journey without these

### 1. A persistent app shell — ✅ nav + footer shipped
`SiteHeader` still renders per page rather than once in `app/layout.tsx` (left
alone: the landing hero's canvas positioning is tuned against its own page
wrapper and moving the header risked breaking it for a cosmetic win). What
shipped: a shared `SiteFooter` on all four routes, and "Vault" added to the
nav — the mobile row under the pill already existed and picked it up for
free. Spec §3's dedicated bottom tab bar is still open; the under-pill row
covers the same job today.

### 2. A vault surface — ✅ shipped
`/vault`: wallet, vault free, total allocated, one row per active follow with
its own spent-today bar, deposit and withdraw. `docs/frontend-ux-gaps.md`
itself is now slightly stale on this one — everything asked for is built.

### 3. "Get test USDG" faucet — **blocked on contracts**
Spec §3, §6. A judge connects with an empty wallet and the whole flow is dead:
deposit needs USDG nobody can obtain. `contracts/src/mocks/` is empty —
MockUSDG doesn't exist yet. It is a ten-line contract on the demo's critical
path.

### 4. Transaction lifecycle outside the modal — ✅ shipped
`TransactionsProvider` + `useTrackedWrite`: a toast host and a pending count
in the header, both independent of whichever modal started the write. Wired
into every write on both screens that have one.

### 5. Connect-gating on actions — ✅ shipped
`useRequireConnection`, applied to Deposit/Follow/Withdraw/Kill on both
screens. Disconnected, they open the Wagmi connector picker instead of
running.

---

## Tier 2 — the trust layer

### 6. The follow panel, with "spent today" — ✅ shipped
Cap, spent-today progress bar, allocation and the kill switch, together in
the agent page's own "Your position" panel — exactly the order spec §5 asks
for. `useSpentToday` reads `policyModuleAbi.spentToday`, shared with the
vault page's own bar.

### 7. PnL chart with range pills
Spec §5 wants the big figure plus a line chart on agent detail. We have
`Sparkline` — twelve points, decorative, hidden from screen readers. The series
is available from `getFillsByAgent` priced per fill.

### 8. Tape pagination
`useFillEvents` reads 50 fills and stops. `getFillsByAgent(offset, limit)`
takes those arguments precisely so this can page; an agent with 142 fills shows
50 with no sign the rest exist. Spec §5 also wants new rows animating in live.

### 9. Copyable hashes, and the TrustBadge tooltip
Spec §5: the full strategy hash, copyable, and "Why this matters" on the trust
badge — *the ledger has no edit or delete function*. Neither exists; there is no
clipboard helper and no tooltip primitive in the repo. The badge makes a claim
the user currently has no way to interrogate.

### 10. A "your mirrors" view
`useMirrorOutcomes` is per agent. The follower's actual question — what has been
mirrored into my vault, across everything I follow — has no screen. It is also
where a rejection should still be visible after navigating away from the agent
that caused it.

---

## Tier 3 — states and polish

### 11. Loading, empty, and error-with-retry
Only `/agents` handles all three. `/leaderboard` and agent detail have none.
There are no skeletons anywhere, no RPC error banner, no retry. Spec §13 wants
them on every data area, and testnet RPC flakiness makes this ordinary, not
defensive.

### 12. Sort control on the agent list
PnL · Fills · Newest. Spec §4.

### 13. The third network state
`NetworkGuard` switches chains and reports an error, but spec §2 wants an
explicit "network not found → Add network" path (`wallet_addEthereumChain`). A
fresh wallet has never heard of chain 46630, so this is the common case.

### 14. Mobile treatments
Modals as bottom sheets, the tape as stacked rows, the tab bar from §3. The
product screens are responsive; these three patterns aren't built.

### 15. Accessibility
No focus trap in any modal. No `aria-live` on the feed or the reject banner — a
screen reader does not hear the demo's centrepiece announce itself. No skip
link.

---

## Cross-cutting: the design-system sheet

Spec deliverable #2, and what makes everything above cheap instead of
expensive: tokens, type scale, button variants (primary, secondary,
destructive, disabled, loading), input states (default, focus, error), badges
(Verified, Following, Losing agent, Killed), table rows, toasts, modal and
bottom sheet, chart. `MetalButton` covers roughly a third.

Defining the rest **during** the design merge rather than after is what stops
the next fifteen components each inventing their own input.

---

## Status

Done: the design merge, #2, #4, #5, #6, and the nav/footer half of #1.
Remaining, roughly in order:

1. **#11 states** — skeletons, empty, error/retry — across `/leaderboard` and
   agent detail, which have none; `/agents` already has all three.
2. **#7 PnL chart**, **#8 tape pagination**, **#12 sort control** — independent
   pickups against data that already exists (`getFillsByAgent`).
3. **#9 copyable hashes + tooltip**, **#10 "your mirrors" view**, **#13 the
   third network state**, **#14 mobile treatments**, **#15 accessibility**.
4. **#3 the faucet** — still blocked on `contracts/src/mocks/` being empty.

## Not ours

- **MockUSDG + faucet** (#3) blocks the demo's opening minute.
- `IPolicyModule.checkAndConsume` still lacks the `isBuy` parameter PRD v2.2
  §7.5 added. Worth fixing before the PolicyModule body is written against the
  current signature.
