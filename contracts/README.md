# Mirror — Contracts

Foundry workspace for the Mirror core primitive. Current spec: **PRD v2.2**, with
unchanged requirements inherited from earlier versions (`../docs/`). Migration is
incremental: AgentRegistry, TrackRecord, PolicyModule, CopyVault, the deployment script,
and the journaled runner are implemented. Live deployment and explorer verification remain pending.

## CopyVault lifecycle and mirroring

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
`mirrorFill` is runner-only and processes each TrackRecord fill at most once. It isolates per-follower
policy rejections as `MirrorRejected` logs, while `isMirrored` reports whether the fill was processed.
Only tokens reporting exactly 18 decimals can be mirrored; invalid token metadata and notional overflow
are terminal malformed-fill errors that the runner alerts on rather than retrying forever.
The frontend ABI includes the new errors and capacity getter. Do not use the contracts for real funds.

`VaultFoundation.t.sol` covers exact transfers/events, user isolation, failed-transfer
rollback, reentrancy with a funded attacker, and multi-user accounting fuzzing.
These tests use code-bearing dependency placeholders, not policy/track-record integration.
`VaultCustodyRegression.t.sol` adds token return-value rollback and 64-action custody
sequences. `VaultLifecycle.t.sol` adds principal/membership tests, policy failures and
callbacks, and 48-action follow/unfollow sequences with final full withdrawal.
The lifecycle unit tests retain a policy double for adversarial callbacks, while mirroring and
drain-beyond-cap tests exercise the real PolicyModule. All required withdrawal, policy-cap and
drain-beyond-cap tests now run.

### Lifecycle decision (Jason, 20 September 2026)

Unfollow clears simulated positions. An internal per-user/per-agent epoch makes this
constant-time even after many different tokens were mirrored; historical slots remain
in storage but are no longer current positions. Future mirror writes must use the current epoch.
Re-follow must preserve the same day's policy spend. CopyVault never clears spend;
the real PolicyModule's `setPolicy` and `kill` must preserve its daily buckets. Changing
the cap below already-spent notional must not forgive that spend. Actual enforcement
and UTC day rollover are enforced by PolicyModule and its integration/invariant tests.
Each follow snapshots the global fill count. Only strictly later fill IDs are eligible;
re-follow captures a fresh boundary. This avoids timestamp ties within one block.
See [review decisions](../docs/decisions/0003-copyvault-lifecycle-review.md) for the additive
ABI amendment and follower-limit tradeoff. Measured with isolated test setup and 50 funded
followers, a buy costs 3,137,690 gas (about 10.5% of a 30M block) and a sell costs 831,008 gas.

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
│   ├── CopyVault.sol        # Jason — custody + principal lifecycle + bounded mirroring
│   ├── AgentRegistry.sol    # Isaac
│   ├── TrackRecord.sol      # Isaac
│   ├── PolicyModule.sol     # Isaac — implemented policy enforcement
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
| 2 | Over-cap rejection | `PolicyCap.t.sol` | Passes; `MirrorRejected(CapExceeded)` leaves the follower position unchanged |
| 3 | Withdraw | `VaultWithdraw.t.sol` | All 3 pass; allocation setup uses a policy double |
| 4 | Drain-beyond-cap | `DrainBeyondCap.t.sol` | Passes against CopyVault and the real PolicyModule |

The suite contains no skipped test. Policy rejection is a `MirrorRejected` log inside a
successful `mirrorFill`, not a reverted transaction.

## Deploy targets

| Chain | ID | Role | Addresses |
|---|---|---|---|
| Robinhood Chain testnet | 46630 | primary | `deployments/46630.json` |
| Arbitrum Sepolia | 421614 | qualifying extra | `deployments/421614.json` |

`evm_version` is pinned to `paris` in `foundry.toml` so the mirrored deploy cannot diverge on
opcode support between the two chains. Jason owns producing and finalizing both
`deployments/*.json` files. The frontend owner consumes those manifests, runs the address sync,
configures live mode, and performs wallet/UI smoke testing; frontend integration is not Jason's
responsibility.

Deployment uses four non-zero, pairwise-distinct testnet identities: deployer, PolicyModule
admin, runner, and agent registrar/owner. Their exact authority boundaries and environment
variables are fixed in [decision 0004](../docs/decisions/0004-deployment-identities.md).
The dedicated deployer must have nonce zero on both chains. The script refuses any other nonce;
this keeps every CREATE address—and therefore every immutable-bearing runtime bytecode—identical.

`script/Deploy.s.sol` deploys mocks and core contracts, keeps PolicyModule and CopyVault
adjacent for nonce-based vault prediction, allowlists the three stocks as the dedicated admin,
registers agents as the registrar, and then asserts every immutable wiring edge. It can write
`deployments/.pending/<chain-id>.json`; agent IDs come from successful registration calls and are never
assumed to be 1/2/3.

```bash
forge script script/Deploy.s.sol:Deploy --rpc-url rh_testnet --broadcast --slow
node script/finalize-manifest.mjs 46630 "$RH_TESTNET_RPC_URL"
forge script script/Deploy.s.sol:Deploy --rpc-url arb_sepolia --broadcast --slow
node script/finalize-manifest.mjs 421614 "$ARB_SEPOLIA_RPC_URL"
node script/compare-deployments.mjs
node script/verify-deployment.mjs 46630 "$RH_TESTNET_RPC_URL"
node script/verify-deployment.mjs 421614 "$ARB_SEPOLIA_RPC_URL"
```

Only the finalizer writes the committed manifest. It requires a successful mined receipt for every
creation, allowlist call and registration, verifies their addresses/code through the target RPC,
reads PolicyModule ownership and all allowlist entries back, reads every registered agent's owner,
strategy hash and active state back, and records each transaction hash plus the first mined deployment
block. `--slow` serializes the multi-sender broadcast so admin and registrar calls cannot be mined
before the contracts they target.

The verification helper reads the finalized manifest, reconstructs every constructor argument,
waits for all eleven source-verification submissions, and writes non-secret evidence under
`deployments/evidence/`. Robinhood uses its Blockscout API; Arbitrum Sepolia uses the
`ARBISCAN_API_KEY` from the ignored environment.

Broadcast only with the four funded testnet identities and after a dry run. Source verification,
committed 46630/421614 manifests, and live smoke evidence are release gates.
The exact operator procedure, fifth non-privileged smoke follower, evidence tables and frontend
ownership boundary are in [the deployment/frontend handoff runbook](../docs/deployment-frontend-handoff.md).
