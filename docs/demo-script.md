# 90-second demo: shot list

Recorded for submission (PRD §10). Copy freezes on Day 17 (Sun 27 Sep). Structure follows the builder briefing §12: problem, tape, cap, unlock, primitive. Lead with the unlock, not "capital safety".

| Time | Beat | On screen | Say | Component |
|---|---|---|---|---|
| 0:00–0:08 | Problem | Static shot of a "100x AI bot" PnL screenshot. | "Every AI trading agent on Twitter has a PnL screenshot. None of them are verifiable. None of them cap what the agent can do with your money." | n/a |
| 0:08–0:15 | Tape | Agent list, then Red's card. | "This is Pulse. This is Red. Yes, we're showing you the losing one, because a real track record has losses in it." | `/agents`, losing-agent badge |
| 0:15–0:25 | Deposit | Connect wallet, "Get test USDG", deposit 100 USDG, success state. | (No line needed; let the two-step approve and deposit play.) | `DepositModal`, faucet |
| 0:25–0:35 | Follow | Follow Pulse with a 50 USDG cap. Hold on the safety sentence above the sign button. | "Pulse can move at most fifty dollars of my vault a day, and I can kill it any time." | `FollowModal` |
| 0:35–0:45 | Fill | A fill lands and the row reads "mirrored to your vault". Cut to the explorer on the real event. | "Every fill is an on-chain event nobody can edit, including us." | `FillFeed`, `TrustBadge` |
| 0:45–1:00 | Reject | A disallowed buy: the fill lands for everyone else, your row reads "blocked by your policy", the banner shows the exact cause. Open the explorer on the `MirrorRejected` log of the successful `mirrorFill` transaction. | "The refusal isn't an error, it's on the ledger. Pact bounds risk between agents. Mirror bounds a human's risk when copying one." | `PolicyRejectBanner`, `FillFeed` |
| 1:00–1:15 | Unlock | "Kill follow · release principal", the chain reads go green, principal is back in free balance, withdraw to wallet. | "The kill switch is guaranteed to free your funds, full stop." | `KillButton`, `WithdrawModal` |
| 1:15–1:30 | Primitive | Logo card, then one roadmap line. | "If you deleted this UI right now, the ledger and the cap would still exist as infrastructure anyone on Robinhood Chain could build on. That's the part that is new." Then: "Next: mainnet in 30 days, a keeper network instead of our runner in 60." | n/a |

## Rehearsal notes

- The app goes live on its own once `deployments/46630.json` has real addresses: `npm run dev` should print `chain 46630 -> 5/5 addresses`. With zero addresses it silently runs on fixtures, so check that line before recording.
- The fill and reject beats need `CopyVault.mirrorFill` implemented and the runner seeding fills. Until then, the reject beat can use the "Simulate {reason}" buttons on `/agents/[id]`. They sit in a box labelled "Demo controls · not part of the product"; keep them looking like that on camera.
- The unlock beat's line is the pitch. Don't soften it to "capital safety".
- Leaderboard isn't in the 90-second cut, but `/leaderboard` shows Red's loss with a "Losing agent" badge if the edit needs a cutaway.
