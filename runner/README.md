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
npm run runner -- --agent=pulse --tick=3
```

Run every agent's ticks in strictly ascending order; the runner rejects a gap. Each agent/tick gets
fresh oracle rounds, so agents may advance independently without sharing stale `latestRoundData`.
`prices.jsonl` stores positive, 8-decimal raw oracle prices. The deployment manifest must match the
runner key and the connected chain; the process reads every immutable wiring edge before sending.
