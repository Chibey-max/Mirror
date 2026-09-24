# Frontend UX gaps

What stands between the current frontend and a UI a stranger can operate
without being walked through it. Measured against
[the design prompt](./claude-design-prompt.md) §§1–13.

Items are grouped by what their absence costs, not by size. Anything marked
**blocked** needs someone outside the frontend.

---

## Tier 1: a user can't finish a journey without these

### 1. A persistent app shell: ✅ nav + footer shipped
`SiteHeader` still renders per page rather than once in `app/layout.tsx` (left
alone: the landing hero's canvas positioning is tuned against its own page
wrapper). A shared `SiteFooter` is on every route and "Vault" is in the nav.
Spec §3's dedicated bottom tab bar is still open; the under-pill row covers
the same job today.

### 2. A vault surface: ✅ shipped
`/vault`: wallet, vault free, total allocated, one row per active follow with
its own spent-today bar, deposit, withdraw, and "your mirrors" (#10).

### 3. "Get test USDG" faucet: ✅ shipped
MockUSDG landed on main with an open `mint`. `useDeposit.getTestUsdg()` mints
1,000 test USDG to the connected wallet, testnets only. It's a button on the
vault page, and the deposit modal offers it inline whenever the wallet can't
cover the amount typed.

### 4. Transaction lifecycle outside the modal: ✅ shipped
`TransactionsProvider` + `useTrackedWrite`: toasts and a pending count in the
header, independent of whichever modal started the write. Failed toasts now
say why (see "Write errors" below); a wallet cancel shows as Cancelled, not
Failed.

### 5. Connect-gating on actions: ✅ shipped
`useRequireConnection` on Deposit/Follow/Withdraw/Kill/faucet. A disconnected
click opens the connect modal and carries on once connected, no second click.
A click while a remembered wallet is still reconnecting after a reload waits
for it instead of asking to connect a wallet the header already shows.

---

## Tier 2: the trust layer

### 6. The follow panel, with "spent today": ✅ shipped
Cap, spent-today bar (colour tiers, "Cap reached" state), allocation and the
kill switch, in the agent page's "Your position" panel.

### 7. PnL chart with range pills: ✅ shipped
Big figure plus a line chart with 1D/7D/30D/All on agent detail. The y-axis is
never forced to include zero, so a losing agent's line can sit below it.

### 8. Tape pagination: ✅ shipped
Pages of 50 via `getFillsByAgent(offset, limit)`, "Showing N of total" from
`fillCountByAgent`, and a "Load earlier fills" button.

### 9. Copyable hashes, and the TrustBadge tooltip: ✅ shipped
`CopyableHash` and `InfoTooltip` in `components/Copyable.tsx`, used for the
strategy hash, the trust badge, and the network details in the wrong-network
guard.

### 10. A "your mirrors" view: ✅ shipped
On `/vault`: every fill from every followed agent, with what happened to this
vault (mirrored, rejected with cause, or not mirrored) and explorer links.

---

## Tier 3: states and polish

### 11. Loading, empty, and error-with-retry: ✅ shipped
`RetryBanner` on `/leaderboard` and agent detail; `/agents` already had all
three.

### 12. Sort control on the agent list: ✅ shipped
PnL · Fills · Newest.

### 13. The third network state: ✅ shipped
wagmi falls back to `wallet_addEthereumChain` when a switch fails with 4902,
so the guard's one button adds then switches. The guard tells a real cancel
apart from a wallet that can't add networks (wagmi reports both as
`UserRejectedRequestError`), and for the latter shows the network details to
add by hand, each copyable.

### 14. Mobile treatments: **design owner**
Modals as bottom sheets, the tape as stacked rows, the tab bar from §3.
Handed to the design side along with the rest of the visual layer.

### 15. Accessibility: ✅ shipped
Focus trap in every modal (initial focus on the amount field, Tab wraps,
focus returns to the opener on close), Withdraw made a real dialog with
Escape, a polite live region on the fill feed that announces only fills
arriving after load, `role=alert` on the reject banner and write errors, and
a skip link.

---

## Write errors

Every vault write is simulated before it's sent, so a revert arrives as a
decoded contract error before the wallet opens. `lib/writeErrors.ts` turns it
into one sentence: CopyVault's errors (`FollowerLimitReached`,
`AgentInactive`, `AlreadyFollowing`, `NotFollowing`, `InsufficientBalance`),
USDG's ERC20 errors recovered from raw revert bytes, wrong network, no gas.
`confirm()` also rejects a transaction that was mined but reverted; it used
to resolve like a success.

The frontend ABIs were diffed against the contracts compiled from main
(solc 0.8.24): every function, event and error the frontend uses matches.

---

## Status

Done: everything above except #14, which is with the design owner, and the
cross-cutting design-system sheet, which went with it.

## Still open, not ours

- **`CopyVault.mirrorFill` is still a `NotImplemented` stub on main.** Until it
  lands, `Mirrored` and `MirrorRejected` never fire, so "your mirrors", the
  reject banner and the leaderboard's mirrored PnL only have fixture data to
  show. The frontend side is wired and waiting.
- **`deployments/46630.json`.** Every address in `lib/contracts.ts` is still
  the zero address, which keeps the whole app on its fixture path.
- **Robinhood Chain RPC and explorer URLs.** `lib/chains.ts` still has a TODO
  to confirm the public endpoints; they also feed the wrong-network guard's
  manual-add details.
