# Mirror — Contracts

Foundry workspace for the Mirror core primitive. Current spec: **PRD v2.2**, with
unchanged requirements inherited from earlier versions (`../docs/`). Migration is
incremental: TrackRecord and PolicyModule still contain earlier scaffold interfaces/bodies.

## CopyVault foundation (not deployment-ready)

`CopyVault.sol` implements deposits and withdrawals with SafeERC20 and a shared
reentrancy guard. It supports exact-transfer, non-rebasing MockUSDG only. Donations
are surplus and never create user credit. Zero-amount deposits/withdrawals are allowed.
Follow, unfollow, mirror, and their related views explicitly revert `NotImplemented`.
The CopyVault interface now reflects v2.2; frontend ABI regeneration and full policy/
track-record integration are still pending. Do not use the foundation for real funds.

`VaultFoundation.t.sol` covers exact transfers/events, user isolation, failed-transfer
rollback, reentrancy with a funded attacker, and multi-user accounting fuzzing.
These tests use code-bearing dependency placeholders, not policy/track-record integration.
The original acceptance skeletons remain skipped until their full scenarios are implemented.

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
│   ├── CopyVault.sol        # Jason — custody foundation only
│   ├── AgentRegistry.sol    # Isaac
│   ├── TrackRecord.sol      # Isaac
│   ├── PolicyModule.sol     # Isaac
│   └── mocks/               # Jason — MockUSDG, MockStock, MockAggregatorV3
├── test/
├── script/                  # Jason — deploy + verify
└── lib/                     # git submodules, pinned
```

## Setup

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

All four must be green before the **Wed 24 Sep integration checkpoint**:

| # | Test | File | Status |
|---|---|---|---|
| 1 | Append-only enforcement | `AppendOnly.t.sol` | Surface tests pass; recorded-fill behavior still skipped |
| 2 | Over-cap revert | `PolicyCap.t.sol` | ⏳ skipped — needs PolicyModule bodies (Day 5) |
| 3 | Withdraw | `VaultWithdraw.t.sol` | Full acceptance skipped; custody covered in `VaultFoundation.t.sol` |
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
