# Mirror runner

The runner advances the three test feeds, evaluates one committed strategy at a fixture tick, records each fill, and then mirrors it. It is deliberately single-sender and sequential.

## Safety model

- Every logical oracle update, `recordFill`, and `mirrorFill` has a deterministic journal key.
- A transaction is signed once. Its raw bytes, hash, and nonce are fsynced before the first broadcast.
- Timeouts, 429s, server failures, `already known`, and `nonce too low` resume the same hash; they never call `writeContract` again.
- A status-0 receipt is final. Contract simulation failures, including `InvalidTokenDecimals` and `NotionalOverflow`, stop the trade and alert through the non-zero process exit.
- The journal is the recovery source after a crash. Do not delete it while transactions are pending.
- Only one process may use a runner key and journal at a time. An exclusive lock enforces this;
  after a hard crash, verify the old process is gone before removing the stale `.lock` file.
- Startup verifies chain ID, runner identity, all immutable wiring, core runtime hashes,
  token allowlisting, agent ownership/activity, and exact strategy-file commitments.

## Run

Copy `.env.example` into your secret-management workflow and export the values. From this directory:

```sh
npm ci
npm test
npm run typecheck
npm run runner -- --agent=pulse --tick=3 --allow-local
```

Run every agent's ticks in strictly ascending order; the runner rejects a gap. Each agent/tick gets
fresh oracle rounds, so agents may advance independently without sharing stale `latestRoundData`.
`prices.jsonl` stores positive, 8-decimal raw oracle prices. The deployment manifest must match the
runner key and the connected chain; the process reads every immutable wiring edge before sending.

## The tape past tick 9

`prices.jsonl` holds ten ticks, and the first deployment ran all of them. `src/tape.ts` extends the
tape without end: ticks 0–9 come back exactly as committed (the fills already on chain were priced
from them), and every later tick is a pure function of a fixed seed, so any machine derives the same
price for it. Nothing in the tape is an on-chain commitment — `strategyHash` covers
`strategies/*.json` only — so extending it invalidates nothing.

The continuation moves in regimes that lean back toward where the fixture ended, which keeps prices
in a believable band and keeps the agents apart: momentum (Pulse) catches trends, and buying weakness
against them (Red) loses. `test/tape.test.ts` fails if either stops being true.

## Scheduled runs

`.github/workflows/agents.yml` runs every 15 minutes:

```sh
npm run runner -- --next --seed=state/journal.seed.json
```

`--next` catches every agent up to the most advanced one, then moves all three one tick together,
so the shared price feeds always end a run on the newest tick. `--steps=N` (1–12) advances several.

The journal lives in the Actions cache between runs. If there is none, `--seed` starts from
`state/journal.seed.json` — completed-tick markers only, no signed transactions — **but only if the
chain's fill count still matches the seed's**. If the cache was evicted after later runs, the counts
disagree and the runner refuses rather than replaying ticks that are already on chain.

**CI is the only runner.** A second runner has a second journal, and each would treat the other's
ticks as still pending and record them again — duplicate fills on a ledger that can never delete
one. Outside GitHub Actions the CLI refuses to run; to run by hand, disable the Agents workflow first
and pass `--allow-local`. The fill-count check above only covers a lost cache, not a second runner.

To pause the agents, disable the workflow. To top up gas, send testnet ETH to the manifest's `runner`.
