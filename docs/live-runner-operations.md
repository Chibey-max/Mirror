# Live market runner: implementation and rollout

This runbook covers the existing Robinhood deployment (46630). It does not change contract
addresses, Solidity contract implementations, registered strategy hashes, or frontend code.
The worker uses live equity prices to simulate trades; it does not execute stock purchases.
TrackRecord still trusts the runner. Relaying a Pyth price through MockAggregatorV3 does **not**
make it cryptographically verified by our contracts. `oracleRoundId` remains the mock feed's
round ID, not a Pyth identifier; source metadata is retained in the worker's observation archive.

## What has and has not been proved

- Unit tests cover price validation, strategy warm-up, persisted decisions, and transaction retries.
- `npm run test:integration` starts a private local Anvil, deploys the real contracts, exercises
  accepted/rejected copying, reconciles legacy positions, injects a crash after `recordFill`,
  recovers without a duplicate fill, and verifies principal withdrawal and receipt evidence.
- The smoke script accepts receipt-derived fill IDs on a deployment that already has history.
- No Railway service, Pyth trial, public-use permission, or successful live mirror is implied by
  merging this code. Those require the account setup and evidence below. Do not present local
  test transaction hashes as testnet evidence.

## Accounts and credentials

1. Create a Pyth trial account and obtain a Hermes API key. Confirm that the account includes
   the regular-session feeds `Equity.US.NVDA/USD`, `Equity.US.AAPL/USD`, and `Equity.US.TSLA/USD`.
   Copy their canonical feed IDs from provider metadata into `PYTH_FEED_NVDA`, `PYTH_FEED_AAPL`,
   and `PYTH_FEED_TSLA`. The worker checks each ID against the exact symbol before running.
2. Confirm that the trial terms or written provider permission cover publishing prices in
   permanent public testnet fills and displaying those fills. Save the reference privately and
   put its identifier in `MARKET_PUBLIC_USE_REFERENCE`. This is an operator attestation, not
   automatic verification of permission. Do not broadcast until confirmed.
3. Set `MARKET_TRIAL_EXPIRES_AT` to the actual trial expiry in ISO UTC. The worker refuses new
   work at expiry; it never upgrades the account or falls back to fabricated/delayed prices.
4. Create a Railway account with GitHub and check trial verification/network access. A restricted
   trial may be unable to reach the provider or RPC. Do not purchase a plan automatically.
5. Configure the existing runner signing key only in private service variables when enabling
   broadcast. Its derived address must match both immutable contracts. Keep the deployer,
   policy admin, registrar, and smoke follower keys out of the worker.

Current provider references, checked during implementation:

- [Pyth authenticated Hermes access and trial](https://docs.pyth.network/price-feeds/core/upgrade/preparing)
- [Pyth REST response format](https://docs.pyth.network/price-feeds/core/fetch-price-updates)
- [Railway trial, restrictions and volume retention](https://docs.railway.com/pricing/free-trial)
- [Railway plans and usage](https://docs.railway.com/pricing/plans)

Railway advertises a $5 trial allowance for up to 30 days, followed by a Free plan with $1/month
credit. This is not a guarantee of free continuous operation. Measure actual consumption, back
up state, and stop before expiry if there is no approved continuation budget. Pyth's trial is
also time-limited. Alpaca was considered but rejected for this public use because its published
[redistribution policy](https://alpaca.markets/support/redistribute-alpaca-api) prohibits redistributing API data.

## Cut over without repeating the old demonstration

Stop every process using the runner signer, including scripts on other machines. The local
file lock cannot protect a second host using a different disk. One signing service is the
operational requirement.

Obtain the **original complete transaction journal** from the operator of the September 26 run.
This checkout does not contain that secret operational file. Do not start with a blank journal
or merge journals by hand. Back up the original before migration.

The worker verifies successful legacy receipts, sender identity, every recorded fill, and
`isMirrored`. It reconstructs agent holdings from their actual fills, including agent buys that
followers rejected. It preserves entry prices and relative holding ages. Each agent's legacy
tick counter is aligned at cutover because agents previously advanced independently.

An incomplete legacy trade or pending signed transaction blocks cutover. Resume its original
fixture CLI invocation using the original journal; it reuses signed bytes/hashes. Resolve a
failed receipt or unexplained fill explicitly. Never delete entries to make validation pass.
If the original journal is missing, recovery from receipts requires a separate reviewed
reconciliation; the worker deliberately does not guess tick identities.

At cutover, fixture prices cease to influence signals. Live observations warm up each strategy's
lookback. Existing positions remain held during warm-up, and holding age advances with accepted
live observations. This source transition can affect performance; record the cutover in the demo
notes and do not present fixture and market periods as a uniform live-market backtest.

## Run locally before hosting

Export values from `runner/.env.example` using your secret-management workflow. Files are not
automatically loaded by the CLI. Both modes need the existing journal and public RPC reads;
dry-run does not require `RUNNER_PRIVATE_KEY`.

```sh
cd runner
npm ci
npm run typecheck
npm test
npm run test:integration
npm run watch -- --once
npm run watch
```

Dry-run is the default. Its positions and decisions live under `RUNNER_LIVE_DIR/dry-run` and
cannot be promoted to broadcast state. Stop it before starting the signing worker.

```sh
npm run watch -- --broadcast --once
npm run watch -- --broadcast
```

The broadcast worker uses `RUNNER_LIVE_DIR/broadcast`. Its `<journal>.live` marker disables the
fixture CLI for that journal after cutover. Retain this marker with backups. Startup detects
changed legacy history, missing receipts, changed feed IDs, changed strategy commitments,
unexpected tape entries, and state restored behind the transaction journal.

Every observation and decision is saved before transactions. The three agents run sequentially.
Empty decisions consume no on-chain gas. A complete iteration waits five minutes before the
next poll; there is no follow-triggered acceleration or guaranteed trade after a follow.

Prices must be positive, no more than two minutes old, not future-dated, and have confidence
width no greater than 1%. All three publication timestamps must advance. Repeated, missing,
stale, or imprecise input produces `waiting_for_prices`, not a trade. Market closures can
therefore leave an online worker idle. Network/429/server failures retry at the next polling
interval. Authentication/identity errors stop the worker. Eight-decimal conversion uses integer
arithmetic and discards sub-unit fractional precision; it rejects a result of zero.

`decisions` and `mirror_outcomes` logs distinguish signals from actual follower acceptance.
A processed fill can have no outcomes (no eligible follower, or a sell with nothing held).
Original strategy sizes remain unchanged: a $20 cap can reject a valid agent buy. Never change
a follower's cap or the hashed strategy silently to manufacture successful copies.

## Railway setup

- Connect this repository, use the repository root as the build context, and set the service's
  config-file path to `runner/railway.toml`. The Dockerfile copies only runner files and manifests.
- Attach one persistent volume at `/data`. Import the original journal as
  `/data/runner.journal.json` before starting. For an already-running live worker, import its
  matching `live/` directory and journal marker as well.
- Use the environment values in `runner/.env.example`. The image already defaults the manifest
  to `/app/deployments/46630.json`, journal to `/data/runner.journal.json`, and live state to
  `/data/live`. Keep credentials out of image layers, build arguments, git, and screenshots.
- Start with `npm run watch` in dry-run mode; later explicitly change the start command to
  `npm run watch -- --broadcast`. No web server or public HTTP route is needed.
- Keep exactly one replica, disable sleeping/serverless behavior, and stop the old deployment
  before replacing it. The checked-in restart policy is `NEVER`: fatal failures need inspection,
  not repeated retries of a permanently invalid trade.
- Review usage and trial expiry daily. Export encrypted backups of the volume after stopping
  the worker, so journal and strategy state form one consistent snapshot. Store backups outside
  Railway before trial volume retention ends.

SIGINT/SIGTERM stops after the current observation and releases the lock. A forced kill can
leave a stale lock. Verify that the old process/container and every other signing process are
gone before removing **only** the lock. Never remove the journal, state, or marker to restart.

If a crash leaves a pending observation, restart from the same disk. Previously signed
transactions retain their bytes and hashes. A recorded trade may still be mirrored when its
price is old; a new oracle update or recording may not use an expired observation. That case
stops for operator reconciliation rather than skipping the trade. Trial expiry stops new
signatures too, including unfinished mirroring; inspect and record outstanding work before expiry.

## Prove the live lifecycle

Use a fresh, funded, dedicated smoke follower under our control. Keep its key outside the worker.
The script defaults to depositing 100 USDG and allocating 60, but `SMOKE_DEPOSIT` and `SMOKE_CAP`
accept raw six-decimal amounts. Select a cap that can admit a naturally triggered Pulse buy
at current prices while permitting a later same-day cap rejection. Do not force strategy signals.

In `contracts/`, simulate each step first, then use `--broadcast --slow` for writes:

```sh
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle --sig 'prepare()' --rpc-url rh_testnet
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle --sig 'prepare()' --rpc-url rh_testnet --broadcast --slow
```

Run the worker and retain the deposit, follow, accepted-mirror and rejected-mirror transaction
hashes. Derive `SMOKE_ACCEPTED_FILL_ID` and `SMOKE_REJECTED_FILL_ID` from those receipts' events;
never assume IDs 1 and 2. Pause the worker once the isolated scenario is reached. Then:

```sh
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle --sig 'checkRunner()' --rpc-url rh_testnet
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle --sig 'exit()' --rpc-url rh_testnet
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle --sig 'exit()' --rpc-url rh_testnet --broadcast --slow
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle --sig 'checkExited()' --rpc-url rh_testnet
```

The script verifies current position/spend, eligibility, cap arithmetic and principal return.
If additional trades or a UTC-day rollover invalidate the isolated scenario, diagnose it rather
than changing expected values to claim a pass. A user can always exit directly via `unfollow`
and `withdraw`; a failed smoke assertion must never be treated as a reason to leave funds locked.

For the independently verified evidence, export `SMOKE_FOLLOWER_ADDRESS` and the six public hashes:
`SMOKE_DEPOSIT_TX`, `SMOKE_FOLLOW_TX`, `SMOKE_ACCEPTED_TX`, `SMOKE_REJECTED_TX`,
`SMOKE_UNFOLLOW_TX`, `SMOKE_WITHDRAW_TX`. From `runner/` run `npm run --silent evidence`.
It reads the actual `Mirrored`, `CapExceeded`, `PolicyKilled`, and withdrawal events, checks
historical spend/positions and fresh exit state, and prints JSON only after all checks pass.
The RPC must support historical state reads at those receipt blocks.

Commit that public JSON under `deployments/evidence/46630-live-smoke.json` only after obtaining
real results. Record the source commit alongside it. No evidence file is fabricated in this PR.
If market conditions produce no qualifying signal, report the live proof as pending.

## Frontend collaborator handoff

No frontend edits are included. Tell the collaborator when the actual cutover is mined, identify
Pyth as the runner's price source, distinguish market-closed/no-signal/failed states, and retain
the disclosure that positions are simulated and oracle prices are runner-relayed. Supply verified
transaction links after the live proof. The PDF report's history-query and display findings remain
their responsibility.
