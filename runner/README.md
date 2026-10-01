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
in a believable band. `test/tape.test.ts` pins determinism, the committed ticks and that band — and
deliberately not any agent's result, which the tape does not guarantee. The prices are simulated, and
the site says so wherever performance is shown.

## The ledger check

Before sending anything, every run compares `TrackRecord.fillCount()` with its journal: the journal
must account for the chain's fills — the higher of the seed's `fillCount` and its highest saved fill
ID — plus at most the trades it sent without saving an ID yet (a run that stopped mid-way, which it
then finishes). A journal behind the chain means a stale cache, a lost save or a second runner, and
running from it would record trades twice, so the runner refuses and sends nothing
(`src/ledger.ts`, `test/ledger.test.ts`).

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
disagree and the runner refuses rather than replaying ticks that are already on chain. The same
check runs on every start, not only a seeded one — see the ledger check above.

**CI is the only runner.** A second runner has a second journal, and each would treat the other's
ticks as still pending and record them again — duplicate fills on a ledger that can never delete
one. Outside GitHub Actions the CLI refuses to run; to run by hand, disable the Agents workflow first
and pass `--allow-local`. The ledger check also refuses once a second runner has recorded anything.

To pause the agents, disable the workflow. To top up gas, send testnet ETH to the manifest's `runner`.

## Live prices (Chainlink)

`MIRROR_PRICE_SOURCE=chainlink` makes `--next` trade on real stock prices instead of the seeded tape.
The default is `tape`, and nothing changes until it is set (in CI, as the repository variable
`MIRROR_PRICE_SOURCE`).

Production Stock Token feeds exist only on Robinhood Chain **mainnet**; testnet ships mocks. The runner
reads the mainnet Chainlink feeds — NVDA/USD, AAPL/USD, TSLA/USD, 8 decimals, 0.5% deviation or 24h
heartbeat (`src/livePrices.ts`) — with a free `eth_call`: no wallet, no gas, no LINK. It publishes those
values into this deployment's oracle exactly as before, so the contracts are unchanged and every price
on chain is the real one.

- **History.** Real prices cannot be regenerated, so each live tick's prices are written to
  `.mirror-runner.live-tape.json` before the tick sends anything, with the mainnet round each came from.
  A retry reuses them. CI caches the file in the same entry as the journal.
- **The hand-over.** The tape had TSLA near $463 when the real price was $356. Spliced naively that is a
  23% crash in one tick: Pulse sells into it and Red buys the "dip". Strategies therefore decide on live
  prices converted into the tape's scale, anchored so the first live tick equals the last seeded one; real
  moves after that keep their true percentages. The chain only ever sees real prices.
- **Market closed.** If no feed has moved since the last tick, no tick is created and nothing is sent.
- **One-way.** Once live prices start, `tape` mode and `--tick` refuse: they would replay live ticks on
  simulated prices.
- **Outcomes.** Nothing guarantees which agent wins on real prices.

## Nonces and dead transactions

The public RPC is load-balanced, and a node that has not imported the runner's last transaction reports
a nonce already used. On 1 Oct at 16:15 UTC a price write was signed that way, every rebroadcast got
"nonce too low" (which the sender reads as "may already be mined"), and the agents stopped for five
hours.

- **Signing** (`src/nonce.ts`) uses the higher of the RPC's pending nonce and one past the highest nonce
  the journal knows was mined. The runner is the only sender for its key, so a lagging node can no
  longer make it reuse a nonce. Only mined nonces count, so it can never open a gap.
- **Dead transactions** (`DurableTransactionSender.provablyDead`). A transaction carried over from an
  earlier run is re-signed only when the runner's nonce has moved past it and its own hash has no
  receipt, checked three times ten seconds apart. A nonce is used once, so such a transaction can never
  be mined, and re-signing it cannot duplicate anything. One signed in the current run is never judged;
  the next run does that. The replacement records the dead hash in `replaces`.
