# Mirror

A tamper-proof, on-chain track record and a hard-capped copy vault for trading agents on Robinhood Chain Stock Tokens.

**Tracks:** Overall Prize Track + Promising Products Track. Deployed and verified on Robinhood Chain testnet 46630, with an identical-bytecode mirror on Arbitrum Sepolia 421614.

You want exposure to a trading agent's Stock Token strategy, and all you have to go on is a PnL screenshot someone could have edited. Mirror replaces the screenshot with a ledger and the promise with a constraint. Every fill the agent makes is an on-chain event that nobody, including us, can edit. You copy it only inside a daily cap you set yourself. And the kill switch is guaranteed to free your funds, full stop.

## Who it's for

A retail Robinhood user who wants exposure to a specific agent's Stock Token strategy, has been burned by edited or cherry-picked PnL screenshots on Twitter or Telegram, and wants a constraint, not a promise.

## The primitive

Mirror writes runner-reported agent fills to an append-only on-chain ledger: no edit or delete function exists, by design, not by permission check. The V1 runner decides which fills and prices are reported; immutability begins once a fill is recorded. A follower's vault mirrors those fills only within a hard on-chain daily cap, a token allowlist, and a kill switch they set and control themselves. PolicyModule is programmable escrow over agent-directed spending: the agent never gets custody beyond that self-set number. V1 returns principal only; mirrored PnL is not withdrawable.

A refusal is proof, not an error. When a fill would breach a follower's cap, the vault logs `MirrorRejected` with the exact reason on a mirroring transaction that succeeds for everyone else. The refusal lives on the same ledger as the trades.

If you deleted the UI, the ledger and the cap would still exist as infrastructure anyone on Robinhood Chain could build on. That's the part that is new.

## The unlock

Unfollowing always returns exactly the principal you put in, whatever the agent's positions did while you were following. There is no mark-to-market and no withdrawal queue standing between you and your money. The kill control is always visible on an agent you follow, and the app confirms the kill with fresh chain reads rather than trusting its own state.

## How this is different

| You might think of | The difference |
|---|---|
| Pact | Pact bounds risk between agents. Mirror bounds a human's risk when copying one. |
| Tilt | Tilt decides what to trade. Mirror doesn't decide anything: it proves what already happened and enforces a hard cap on what can happen next. |
| Bond.Credit | Bond.Credit answers "can this agent borrow." Mirror answers "can I trust this tape enough to follow it, and how much can it cost me if I'm wrong." |
| eToro, dHedge, APM | Those ask you to trust a screenshot or a vault manager. Every fill here is an on-chain event with an oracle snapshot, and the agent never has custody. |

## Trust boundaries in V1

Stated up front, not left for a judge to find:

- **The runner is a trusted relay.** It records fills and triggers mirroring (PRD v2.2 §5.2, oracle Option A). It cannot edit a fill once written and cannot move a follower's funds past their cap. Replacing it with a keeper network is on the 60-day roadmap.
- **Slippage is stored, not enforced.** The field is kept on each policy, but V1 has no re-quote window to enforce it in.
- **No real settlement.** Positions are mirrored in token units against oracle prices using mock Stock Tokens. Real execution is on the 90-day roadmap.
- **The agents are deterministic strategies**, not live model inference. Pulse, Red and Drift run from a CLI, and Red's strategy is a JSONL fixture, so nothing about the "AI" is hidden.

## Judging criteria

| Criterion | How Mirror addresses it |
|---|---|
| Smart contract quality & security | 4 contracts (AgentRegistry, TrackRecord, PolicyModule, CopyVault) with SafeERC20 and reentrancy guards. Foundry suites for append-only enforcement, isolated over-cap rejection, the daily cap end to end, drain-beyond-cap, vault lifecycle, custody regression, withdrawal and solvency, plus invariant runs on the registry, the track record and the policy module. |
| Product-market fit | A named user: a retail Robinhood user following an agent's Stock Token strategy, on Robinhood Chain's live Stock Tokens product. |
| Innovation & creativity | A new on-chain rule, not a new UI on an old one: an append-only fill ledger plus programmable escrow over agent-directed spending. |
| Real problem-solving | The loop closes live: a disallowed trade is refused on-chain and logged as `MirrorRejected`, the kill frees the principal, and every step has an explorer link. |

## Live deployment

Same addresses on both chains — one deployer at nonce zero, identical bytecode, confirmed by
`contracts/script/compare-deployments.mjs`.

| Contract | Address | 46630 | 421614 |
|---|---|---|---|
| AgentRegistry | `0x8261CD47Cd22A96Aa169a8381ff5d825797215f3` | [verified](https://explorer.testnet.chain.robinhood.com/address/0x8261CD47Cd22A96Aa169a8381ff5d825797215f3) | [verified](https://arbitrum-sepolia.blockscout.com/address/0x8261CD47Cd22A96Aa169a8381ff5d825797215f3) |
| TrackRecord | `0xb1B17711ee5c8737E573156561850DAA9e9799ed` | [verified](https://explorer.testnet.chain.robinhood.com/address/0xb1B17711ee5c8737E573156561850DAA9e9799ed) | [verified](https://arbitrum-sepolia.blockscout.com/address/0xb1B17711ee5c8737E573156561850DAA9e9799ed) |
| PolicyModule | `0x3694428E4b527826d168FC7BF3e2e6e26cFE538f` | [verified](https://explorer.testnet.chain.robinhood.com/address/0x3694428E4b527826d168FC7BF3e2e6e26cFE538f) | [verified](https://arbitrum-sepolia.blockscout.com/address/0x3694428E4b527826d168FC7BF3e2e6e26cFE538f) |
| CopyVault | `0xf47B9234Ba4aF39Ec28bF3C303B3EDEa3AbE1061` | [verified](https://explorer.testnet.chain.robinhood.com/address/0xf47B9234Ba4aF39Ec28bF3C303B3EDEa3AbE1061) | [verified](https://arbitrum-sepolia.blockscout.com/address/0xf47B9234Ba4aF39Ec28bF3C303B3EDEa3AbE1061) |
| MockUSDG | `0xC9e3E8d3e259Bf33318996AFDe2a5EC134BB3b50` | [verified](https://explorer.testnet.chain.robinhood.com/address/0xC9e3E8d3e259Bf33318996AFDe2a5EC134BB3b50) | [verified](https://arbitrum-sepolia.blockscout.com/address/0xC9e3E8d3e259Bf33318996AFDe2a5EC134BB3b50) |

Full manifests, including the mock stock tokens, price feeds, role addresses and every deployment
transaction hash, are in [`deployments/46630.json`](deployments/46630.json) and
[`deployments/421614.json`](deployments/421614.json).

### The loop, on chain

Three transactions on 46630 that show the product doing what it claims:

| Step | What it proves | Transaction |
|---|---|---|
| **Fill recorded** | The runner wrote an agent's trade to the append-only ledger. `TrackRecord` has no edit or delete function, so this row is permanent. | [`0xd582a6b0…`](https://explorer.testnet.chain.robinhood.com/tx/0xd582a6b0327a158fa84cef9d4a42a9569d076aade1077d1b4dd4601404855833) |
| **Cap enforced** | A follower with a $1/day cap was protected from a $54.68 trade. `MirrorRejected` carries `CapExceeded(54684000, 1000000)` — the refusal is a fact on chain, not a UI message. | [`0x3adfc5a5…`](https://explorer.testnet.chain.robinhood.com/tx/0x3adfc5a5db872274144dd04c933207301ca69ad32cd0aa19cf382d4d10ef2733) |
| **Principal returned** | After `unfollow`, the follower withdrew all 100 USDG. Vault balance zero, wallet whole. | [`0x0ae0bb66…`](https://explorer.testnet.chain.robinhood.com/tx/0x0ae0bb66b6af11349140b0130792f13bb3ccd10a058f42fc51e78dc6e2c0cf37) |

## Roadmap

- **30 days:** Mainnet Robinhood Chain deploy, real Chainlink feeds for 3+ Stock Tokens, a security review pass, and 2 or 3 pilot agent operators onboarded.
- **60 days:** Replace the trusted runner with a keeper network, so recording and mirroring need no trusted relay. A public read API for third parties to query verified track records. A larger agent roster.
- **90 days:** Live mainnet Stock Token trading through a custody and execution partner, on-chain slippage enforcement with a re-quote window, and token-gated strategy access.

## Architecture

The frontend (Next.js + wagmi/viem) reads `AgentRegistry` and `TrackRecord`, and writes to `CopyVault` (deposit, follow, unfollow, withdraw). The runner calls `TrackRecord.recordFill()` and `CopyVault.mirrorFill()` directly. The frontend never triggers recording or mirroring itself.

```text
Frontend (Next.js)  ──reads──▶  AgentRegistry, TrackRecord
        │
        └──writes─▶ CopyVault ──calls──▶ PolicyModule (checkAndConsume)

Agent Runner (Node CLI) ──▶ TrackRecord.recordFill() ──▶ CopyVault.mirrorFill()
                                                          └─▶ Mirrored | MirrorRejected
```

## Repo layout

```text
contracts/    Foundry workspace: AgentRegistry, TrackRecord, PolicyModule, CopyVault, mocks, tests
frontend/     Next.js app
runner/       Deterministic agent strategies (Pulse, Red, Drift) + CLI
deployments/  Contract addresses per chain; the frontend reads these directly
docs/         Design prompt, decisions, demo script, frontend gap list
```

## Local development

See `contracts/README.md`, `frontend/README.md`, `runner/README.md`, and the
[deployment/frontend handoff runbook](docs/deployment-frontend-handoff.md). Fixture mode is explicit
and visibly bannered. A live frontend build fails until both finalized deployment manifests have
generated non-zero address configuration.

On a testnet, "Get test USDG" on the vault page mints MockUSDG to the connected wallet.

## License

See [LICENSE](./LICENSE).
