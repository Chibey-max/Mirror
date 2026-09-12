# Mirror

A tamper-proof, on-chain performance ledger and hard-capped copy-vault for trading agents on Robinhood Chain.

**Tracks:** Overall Prize Track + Promising Products Track — deployed on Robinhood Chain (testnet 46630, mirrored to Arbitrum Sepolia 421614).

## The problem

Every "AI trading agent" advertised on social media comes with a PnL screenshot. None of them are independently verifiable, and none of them structurally limit what the agent can do with a follower's money — the follower is trusting a claim, not a constraint.

## The primitive

Mirror writes every agent fill to an append-only on-chain ledger — no edit or delete function exists, by design, not by permission check. A follower copies an agent's trades only within a hard, on-chain spend cap, token allowlist, and kill switch they set and control themselves. The agent never receives custody beyond that self-set number.

If you deleted the UI, the ledger and the cap would still exist as usable infrastructure — that's the part we think is actually new.

## Judging criteria

| Criterion | How Mirror addresses it |
|---|---|
| Smart contract quality & security | 4 contracts (AgentRegistry, TrackRecord, PolicyModule, CopyVault), SafeERC20 + reentrancy guards, Foundry tests for append-only enforcement, over-cap revert, withdraw, and drain-beyond-cap |
| Product-market fit | Targets Robinhood Chain's live Stock Tokens product and a real, named trust problem in agent-driven trading |
| Innovation & creativity | Verifiability-as-infrastructure framing, not another copy-trading dashboard |
| Real problem-solving | A live policy-reject demo — an agent attempting a disallowed trade is blocked on-chain, visibly, not hypothetically |

## Roadmap (Grants track)

- **30 days:** Mainnet Robinhood Chain deploy, real Chainlink feeds for 3+ Stock Tokens, security review pass, 2–3 pilot agent operators onboarded.
- **60 days:** Expand agent roster, ERC-4337 session-key delegation for policy enforcement, public read API for third parties to query verified track records.
- **90 days:** Live RH mainnet Stock Token trading via a custody/execution partner, explore token-gated strategy access.

## Architecture

Frontend (Next.js + wagmi/viem) reads `AgentRegistry` and `TrackRecord`, and writes to `CopyVault` (deposit/follow/unfollow/withdraw). The Runner calls `TrackRecord.recordFill()` and `CopyVault.mirrorFill()` directly — the frontend never triggers recording or mirroring itself.

```
Frontend (Next.js)  ──reads──▶  AgentRegistry, TrackRecord
        │
        └──writes─▶ CopyVault ──calls──▶ PolicyModule (checkAndConsume)

Agent Runner (Node CLI) ──▶ TrackRecord.recordFill() ──▶ CopyVault.mirrorFill()
```

## Repo layout

```
contracts/    Foundry workspace — AgentRegistry, TrackRecord, PolicyModule, CopyVault, mocks, tests
frontend/     Next.js app — see frontend/README.md for local dev
runner/       Deterministic agent strategies (Pulse, Red, Drift) + CLI
deployments/  Contract addresses per chain, published by Jason on deploy day
docs/         Design prompt, decisions, demo script
```

## Local development

Contracts and frontend are independent workspaces — see `contracts/README.md` and `frontend/README.md`. Until `deployments/46630.json` is published, the frontend runs against fixture data in `frontend/lib/fixtures.ts` (see each component's TODO for the swap-over point).

## License

See [LICENSE](./LICENSE).
