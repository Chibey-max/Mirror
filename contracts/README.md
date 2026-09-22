# Mirror — Contracts

Foundry workspace for the Mirror core primitive. Current spec: **PRD v2.2**, with
unchanged requirements inherited from earlier versions (`../docs/`). Migration is
incremental: TrackRecord is implemented; PolicyModule still contains its earlier scaffold.

## CopyVault foundation (not deployment-ready)

`CopyVault.sol` implements deposits and withdrawals with SafeERC20 and a shared
reentrancy guard. It supports exact-transfer, non-rebasing MockUSDG only. Donations
are surplus and never create user credit. Zero-amount deposits/withdrawals are allowed.
Follow reserves `capAmount` from free funds as principal and calls `setPolicy`.
Unfollow returns only that principal, removes membership, clears virtual positions,
and calls `kill`. Both operations are non-reentrant and roll back on policy failure.
Follower removal uses swap-and-pop, so list ordering is not stable across removals.
Zero-cap follows are allowed (no zero-cap rejection is specified); membership is tracked
independently of principal. At most 50 followers may follow each agent. A follow requires
an existing, active agent; later deactivation never blocks unfollow. Slippage is not enforced.
Mirror still reverts `NotImplemented`; `isMirrored` returns false until mirror writes exist.
The frontend ABI includes the new errors and capacity getter. Full policy integration
and mirroring remain pending. Do not use the foundation for real funds.

`VaultFoundation.t.sol` covers exact transfers/events, user isolation, failed-transfer
rollback, reentrancy with a funded attacker, and multi-user accounting fuzzing.
These tests use code-bearing dependency placeholders, not policy/track-record integration.
`VaultCustodyRegression.t.sol` adds token return-value rollback and 64-action custody
sequences. `VaultLifecycle.t.sol` adds principal/membership tests, policy failures and
callbacks, and 48-action follow/unfollow sequences with final full withdrawal.
The lifecycle policy is a test double: the real PolicyModule remains a stub and follow
against it still fails. No test asserts that this dependency must remain unimplemented.
Jason will add real integration tests when incorporating PolicyModule PR #15.
The three withdrawal acceptance tests now run; policy and drain-beyond-cap tests remain pending.

### Lifecycle decision (Jason, 20 September 2026)

Unfollow clears simulated positions. An internal per-user/per-agent epoch makes this
constant-time even after many different tokens were mirrored; historical slots remain
in storage but are no longer current positions. Future mirror writes must use the current epoch.
Re-follow must preserve the same day's policy spend. CopyVault never clears spend;
the real PolicyModule's `setPolicy` and `kill` must preserve its daily buckets. Changing
the cap below already-spent notional must not forgive that spend. Actual enforcement
and day rollover require Isaac's implementation and integration tests.
Each follow snapshots the global fill count. Only strictly later fill IDs are eligible;
re-follow captures a fresh boundary. This avoids timestamp ties within one block.
See [review decisions](../docs/decisions/0003-copyvault-lifecycle-review.md) for the additive
ABI amendment and follower-limit tradeoff. Worst-case mirror gas remains to be measured.

The mock tokens expose unrestricted testnet minting (USDG: 6 decimals; stocks: 18).
The mock oracle uses 8 decimals and owner-only positive price updates. Every update
creates a new non-zero round, even at the same price/timestamp. Reads before the first
update or for unknown rounds revert. `Mocks.t.sol` verifies these behaviors.

## Layout

```
contracts/
├── src/
│   ├── interfaces/          # FROZEN ABI — PRD Section 4. Read the freeze rule below.
│   │   ├── IAgentRegistry.sol
│   │   ├── ITrackRecord.sol
│   │   ├── IPolicyModule.sol
│   │   └── ICopyVault.sol   # v2.2 interface
│   ├── CopyVault.sol        # Jason — custody + principal lifecycle; mirroring pending
│   ├── AgentRegistry.sol    # Isaac
│   ├── TrackRecord.sol      # Isaac
│   ├── PolicyModule.sol     # Isaac
│   └── mocks/               # Jason — MockUSDG, MockStock, MockAggregatorV3
├── test/
├── script/                  # Jason — deploy + verify
└── lib/                     # git submodules, pinned
```

## Setup

Use Foundry **v1.7.1**, also pinned in CI, to keep formatter behavior consistent.

```bash
git submodule update --init --recursive   # forge-std v1.16.2, openzeppelin-contracts v5.7.0
cp .env.example .env                      # then fill it in — never commit .env
forge build
forge test
```

## The ABI freeze

`src/interfaces/` is frozen as of **Sat 13 Sep 2026, 09:00 SGT**. After that point, changing a
function signature, event, error, or struct field requires a whole-team sync — not a unilateral
edit. David and Patrick's frontend is built against these exact types from the freeze onward.

The scaffold includes compiled-ABI snapshots for field order/types, events, and errors.
Named struct literals alone do not detect field reordering. The CopyVault v2.2 ABI
update needs coordinated frontend adoption; passing the older scaffold is not proof
that all contracts or consumers have migrated.

## The append-only guarantee

`TrackRecord` has no `editFill`, `deleteFill`, or `setFill` — under any name, including behind an
admin modifier. This is enforced by **omission**, and `AppendOnlyTest` probes every plausible
mutation signature to prove it stays that way.

If `AppendOnlyTest` goes red, a mutation path was added. Delete the function — do not delete
the probe.

## Required test suite (PRD Section 7)

All four must be green before the **Thu 24 Sep integration checkpoint**:

| # | Test | File | Status |
|---|---|---|---|
| 1 | Append-only enforcement | `AppendOnly.t.sol` | Surface and recorded-fill tests pass |
| 2 | Over-cap revert | `PolicyCap.t.sol` | ⏳ skipped — needs PolicyModule bodies (Day 5) |
| 3 | Withdraw | `VaultWithdraw.t.sol` | All 3 pass; allocation setup uses a policy double |
| 4 | Drain-beyond-cap | `DrainBeyondCap.t.sol` | Full acceptance skipped; custody reentrancy/fuzz tests implemented separately |

Skeletons call `vm.skip(true)` on purpose. A test that asserts nothing but reports green is
worse than no test — it makes the Section 7 gate look satisfied when it is not. Remove the
`vm.skip` line as each body lands.

## Deploy targets

| Chain | ID | Role | Addresses |
|---|---|---|---|
| Robinhood Chain testnet | 46630 | primary | `deployments/46630.json` |
| Arbitrum Sepolia | 421614 | qualifying extra | `deployments/421614.json` |

`evm_version` is pinned to `paris` in `foundry.toml` so the mirrored deploy cannot diverge on
opcode support between the two chains. Both `deployments/*.json` files are owned by Jason and
consumed by the frontend.
