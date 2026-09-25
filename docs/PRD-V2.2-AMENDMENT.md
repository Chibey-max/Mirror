# Mirror PRD v2.2 amendment — contract and runner decisions

Date: 23 September 2026. This document records the additive ABI and behavioral decisions implemented after `Mirror-PRD-v2.2.pdf`. It does not replace the PRD. Existing function, event, and struct signatures remain unchanged except for the already-approved five-argument `PolicyModule.checkAndConsume` signature.

## AgentRegistry

`deactivateAgent` is one-way. Calling it for an already inactive agent reverts `AgentInactive(uint256 agentId)` instead of emitting a second event.

## TrackRecord

The public immutable getters are `registry()` and `runner()`. The constructor rejects a zero/code-less registry with `ZeroRegistry()` and a zero runner with `ZeroRunner()`.

`recordFill` checks, in order: runner authorization; non-zero token, size and price; agent existence; agent activity. IDs begin at 1 and are never reused. Unknown `getFill` calls return an all-zero fill. `getFillsByAgent` is oldest-first and clamps every offset/limit; `fillCountByAgent` is the paging total.

Additive errors are `AgentInactive(uint256)`, `ZeroToken()`, `ZeroSize()`, and `ZeroPrice()`. The tape proves immutability after recording. The trusted V1 runner still supplies execution truth, price, round reference, and completeness; TrackRecord does not independently verify them.

## PolicyModule

`checkAndConsume(address,uint256,address,uint256,bool)` checks `OnlyVault`, active policy, token allowlist, then the buy-only cap. Rejection changes no state. Sells never consume daily spend. Spend is keyed by follower, agent, and `block.timestamp / 1 days`, resetting at 00:00 UTC.

`setPolicy` accepts a zero cap and does not enforce slippage. Same-day spend survives kill and re-follow. `kill` is idempotent for the vault and emits `PolicyKilled` only when an active policy changes state. `TokenAllowlisted(address,bool)` records every allowlist administration call. The owner can only manage that list and transfer/renounce ownership; the module holds no funds.

## CopyVault

Buy notional is `ceil(size * price / 10^(18 + 2))`, yielding raw 6-decimal USDG for an 8-decimal price. The implementation uses full-precision multiplication and rejects overflow with `NotionalOverflow(fillId)`. Mirrored tokens must report exactly 18 decimals or the fill reverts `InvalidTokenDecimals(token)` before processing. Both errors are terminal runner alerts.

At most 50 wallets may follow an agent. This bounds the mirror loop but does not stop 50 addresses occupying all slots. At the measured maximum, an isolated buy costs 3,137,690 gas and a sell 831,008 gas. Zero-cap follows remain valid membership.

A follow requires an existing active agent and captures the current global fill count. Only strictly later fill IDs are eligible. Unfollow clears virtual positions through a new epoch, preserves same-day policy spend, returns principal, and never checks later agent activity. A fill is marked processed even if no follower is eligible. Individual policy errors become `MirrorRejected` logs while other followers continue; malformed calls and fill-level errors still revert.

Additive surface: constructor errors `ZeroTrackRecord`, `ZeroPolicyModule`, `ZeroUsdg`; admission errors `FollowerLimitReached`, `AgentNotFound`, `AgentInactive`; mirror errors `NotRunner`, `FillNotFound`, `FillAlreadyMirrored`, `InvalidTokenDecimals`, `NotionalOverflow`, `PositionOverflow`; getters `MAX_FOLLOWERS_PER_AGENT`, `followerCountOf`, and `followFillBoundaryOf`.

## Deployment and identities

Deployment uses four non-zero, pairwise-distinct testnet identities: deployer, PolicyModule admin, runner, and agent registrar/owner. PolicyModule and CopyVault are consecutive deployer creations; the predicted CopyVault address is read back through `policyModule.vault()`. All other immutable links, the admin, allowlist, agent ownership, and exact strategy hashes are asserted before a manifest is written.

Agent IDs come from each successful `registerAgent` call, never assumed values. Pulse, Red, and Drift strategy hashes are `keccak256` of the exact committed JSON bytes in `runner/src/strategies/`. USDG is not on the stock-token allowlist.

## Runner finality and retries

For each logical oracle update, fill, and mirror, the runner signs once and fsyncs the raw bytes, hash, and nonce before sending. RPC timeouts, 429/server failures, `already known`, and `nonce too low` only rebroadcast the same bytes and poll the same hash. A status-0 receipt, contract simulation error, `InvalidTokenDecimals`, or `NotionalOverflow` is final and requires an operator-visible stop. A crash resumes from the journal; it never rebuilds a transaction for the same logical trade.

## Demo wording

A policy failure is a `MirrorRejected` log inside a successful `mirrorFill`, not a reverted transaction. After unfollow, the wallet is absent from the follower loop, so the kill proof is fresh reads showing an inactive policy, zero allocation, and follower-list absence—not a later `PolicyInactive` event.
