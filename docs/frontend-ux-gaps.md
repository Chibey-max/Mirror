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

### 1. A persistent app shell
`SiteHeader` renders per page, not in `app/layout.tsx`. There is no footer and
no mobile navigation of any kind: on a phone, the only way between sections is
the browser back button. Spec §3 wants desktop top nav plus a bottom tab bar
(Agents · Leaderboard · Vault).

### 2. A vault surface
Balances exist only on one agent's detail page. Follow two agents and there is
nowhere to see total position, per-follow caps, or what has been spent. Needs a
`/vault` route or a persistent summary in the shell: free balance, total
allocated, a row per follow, deposit and withdraw. Spec §3.

### 3. "Get test USDG" faucet — **blocked on contracts**
Spec §3, §6. A judge connects with an empty wallet and the whole flow is dead:
deposit needs USDG nobody can obtain. `contracts/src/mocks/` is empty —
MockUSDG doesn't exist yet. It is a ten-line contract on the demo's critical
path.

### 4. Transaction lifecycle outside the modal
Every write's state lives inside the modal that started it; close the modal
mid-transaction and the transaction disappears from the UI. Spec §8, §13 want a
toast host and a pending indicator in the header. The plumbing exists:
`WriteProgress` in `hooks/useVaultConnection.ts` already reports `submitted`
with the hash, so this is a store plus a host, not new hook work.

### 5. Connect-gating on actions
Spec §13: read-only browsing works, actions prompt to connect. Today Deposit,
Follow and Withdraw render as live buttons for a disconnected visitor and fail
at the wallet layer. One wrapper, not a check per button.

---

## Tier 2 — the trust layer

### 6. The follow panel, with "spent today"
Spec §5. The cap is the product, and after you set it you never see it again.
Needs cap, spent today as a progress bar against it, allocation, and the kill
switch together in one panel. `spentToday` is already in `policyModuleAbi` with
no consumer. **The highest-value single component on this list.**

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

## Order

1. **Merge the design shell-first** — layout, header, footer, tokens, and the
   button/input/badge set. Port the system, then re-skin screens against it;
   porting screen by screen produces fifteen one-off styles.
2. **Shell gaps** — tab bar, vault summary, toast host, pending indicator,
   connect-gating. All shell-level, so they land in one pass.
3. **The follow panel** (#6), which needs the vault context from step 2.
4. **States** (#11) across all four routes at once.
5. **Chart, pagination, sort, clipboard, tooltip** — independent pickups, no
   collisions between them.

## Not ours

- **MockUSDG + faucet** (#3) blocks the demo's opening minute.
- `IPolicyModule.checkAndConsume` still lacks the `isBuy` parameter PRD v2.2
  §7.5 added. Worth fixing before the PolicyModule body is written against the
  current signature.
