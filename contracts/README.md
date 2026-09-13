# Mirror — Contracts

Foundry workspace for the Mirror core primitive. Spec of record: **PRD v1.0, Section 4**
(`Mirror-PRD.pdf`). This README does not restate the spec — it says how to run the workspace.

## Layout

```
contracts/
├── src/
│   ├── interfaces/          # FROZEN ABI — PRD Section 4. Read the freeze rule below.
│   │   ├── IAgentRegistry.sol
│   │   ├── ITrackRecord.sol
│   │   ├── IPolicyModule.sol
│   │   └── ICopyVault.sol   # published here; implementation is Jason's
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

`ScaffoldTest.test_FrozenStructShapes` uses named struct literals, so a field added, reordered,
or retyped after the freeze breaks the build rather than failing silently at the ABI boundary.

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
| 1 | Append-only enforcement | `AppendOnly.t.sol` | ✅ green |
| 2 | Over-cap revert | `PolicyCap.t.sol` | ⏳ skipped — needs PolicyModule bodies (Day 5) |
| 3 | Withdraw | `VaultWithdraw.t.sol` | ⏳ skipped — needs CopyVault (Jason) |
| 4 | Drain-beyond-cap | `DrainBeyondCap.t.sol` | ⏳ skipped — needs CopyVault (Jason) |

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
