# 90-second demo — shot list

Recorded for submission (PRD §10, Day 17). Each beat maps to a component already built on `frontend-2`.

| Time | Beat | On screen | Component |
|---|---|---|---|
| 0:00–0:08 | Problem | Static shot of a fake "100x AI bot" screenshot. VO: "Every AI trading agent you've seen has a PnL screenshot. None of them are verifiable." | — |
| 0:08–0:15 | Agents | Cut to agent list. "This is Pulse. This is Red — yes, we're showing you the losing one, because a real track record has losses in it." | `/agents`, `Badge` (losing) |
| 0:15–0:25 | Deposit | Connect wallet → deposit $100 mock USDG → success state. | `DepositModal` (David) |
| 0:25–0:35 | Follow | Follow Pulse with a $50 cap → confirmation. | `FollowModal` (David) |
| 0:35–0:50 | Fill | A fill lands, vault balance updates live on screen, cut to explorer showing the real event. | `FillFeed`, `TrustBadge` |
| 0:50–1:05 | Reject | Agent attempts a disallowed/oversized trade → the fill lands for everyone else, your row reads "blocked by your policy", exact error copy shown in UI → cut to explorer showing the `MirrorRejected` log on the successful `mirrorFill` tx. | `PolicyRejectBanner`, `FillFeed` |
| 1:05–1:15 | Kill | Hit kill/unfollow → badge: "This agent can no longer move your funds" → show fresh reads proving `getPolicy().active == false`, `allocationOf == 0`, and the wallet absent from `followersOf`. | `KillButton` |
| 1:15–1:25 | Withdraw | Withdraw remaining balance back to wallet. | `WithdrawModal` |
| 1:25–1:30 | Close | "The tape can't be edited. The cap can't be exceeded. This is Robinhood Chain." Logo card. | — |

## Rehearsal notes

- Fixture-mode controls are rehearsal-only and the top-of-page banner says so. The submitted recording must use live mode and explorer-backed transactions.
- After `unfollow`, the wallet is removed from the follower loop, so a later fill emits no `PolicyInactive` rejection for it. The three fresh reads above are the kill proof.
- Leaderboard (beat not currently in the 90s cut, but worth having ready) shows Red's −11.7% with a "Losing agent" badge at `/leaderboard` — useful as a b-roll cutaway if the edit runs short.
