# Deployment and frontend handoff runbook

**Owner:** Jason — contracts, deployment, runner, manifests and contract-side evidence
**Frontend owner:** consumes the completed packet; owns address generation, live-mode configuration and wallet/UI testing
**Status:** `PRE-DEPLOYMENT` — source tooling is ready; public addresses and evidence remain pending

This is the release procedure for Mirror's V1 testnet contracts. It deliberately separates source
readiness from live-chain evidence. Do not mark this document `READY FOR FRONTEND` until both
manifests are finalized from mined receipts, every source is verified, and the primary-chain smoke
path is complete.

## 1. Deliverables

The frontend handoff consists only of public, reviewable artifacts:

- `deployments/46630.json` — Robinhood Chain testnet, primary deployment;
- `deployments/421614.json` — identical-address Arbitrum Sepolia deployment;
- `deployments/evidence/46630-verification.json` and `421614-verification.json`;
- the deployed Git commit and runtime-code hashes;
- agent IDs and exact strategy hashes;
- explorer links for one fill, one accepted mirror, one policy rejection, kill/unfollow and withdrawal;
- the ABI fragments already checked against compiled Foundry artifacts.

Never hand off private keys, private RPC URLs, `.env` files, runner journals, passwords or raw signed
transactions. The frontend never receives deployer, admin, runner, registrar or smoke-follower keys.

## 2. Networks and ownership

| Chain | ID | Purpose | RPC environment | Explorer |
| --- | ---: | --- | --- | --- |
| Robinhood Chain testnet | 46630 | Primary demo and runner | `RH_TESTNET_RPC_URL` | `https://explorer.testnet.chain.robinhood.com` |
| Arbitrum Sepolia | 421614 | Identical-bytecode mirror | `ARB_SEPOLIA_RPC_URL` | `https://sepolia.arbiscan.io` |

Four operational wallets are non-zero, pairwise distinct and identical across both deployments:

| Identity | Authority | Funding requirement |
| --- | --- | --- |
| Deployer | None after construction | Eleven creations per chain; nonce must be zero before each deployment |
| Policy admin | PolicyModule allowlist only | Three allowlist transactions per chain |
| Runner | Immutable TrackRecord/CopyVault writer | Oracle, record and mirror transactions |
| Agent registrar | Owns/deactivates Pulse, Red and Drift | Three registrations per chain |

A fifth, non-privileged wallet is the smoke follower. It is funded only on chain 46630 and receives
no administrative authority. This keeps all operational roles out of the follower proof.

The deployed assets are the reviewed V1 mocks: MockUSDG, mNVDA, mAAPL, mTSLA and three
MockAggregatorV3 feeds. Do not substitute canonical or faucet tokens without a new contract review.

## 3. Secret and funding preparation

Create ignored local files from `contracts/.env.example` and `runner/.env.example`. Use dedicated,
testnet-only keys. Restrict both files to their owner:

```sh
chmod 600 contracts/.env runner/.env
```

The contracts environment contains the deployer, admin, registrar and smoke-follower keys plus the
runner and smoke-follower public addresses. The runner key exists only in `runner/.env`. Export the
chosen secret source into the current shell without printing values before using Node scripts.

Before simulation, record the five public addresses and check:

- both RPCs report the intended chain ID;
- the four operational addresses are pairwise distinct;
- the smoke follower differs from every operational address;
- the deployer nonce is exactly zero on both chains;
- the deployer, admin and registrar have native testnet ETH on both chains;
- the runner has gas on chain 46630, and the smoke follower has gas there;
- `RUNNER_ADDRESS` equals the address derived from `RUNNER_PRIVATE_KEY`;
- `SMOKE_FOLLOWER_ADDRESS` equals the address derived from `SMOKE_FOLLOWER_PRIVATE_KEY`.

An incoming faucet transfer does not increase the deployer's nonce. Do not send any transaction from
the deployer before both deployments finish.

## 4. Source preflight

The deployed commit must pass the complete source gate from a clean checkout:

```sh
cd contracts
forge fmt --check
forge build --sizes
node script/check-frontend-abi.mjs
FOUNDRY_PROFILE=ci forge test

cd ../runner
npm ci
npm run typecheck
npm test

cd ../frontend
npm ci
npm run check:abi
npm test
npm run lint
NEXT_PUBLIC_MIRROR_MODE=fixture npm run build
npm audit --omit=dev
```

Expected baseline before deployment: 224 Foundry tests, 16 frontend tests, 8 runner tests, no skips,
no failures and no production dependency advisories. Record the exact Git commit in the evidence
table below. Any source change after this gate creates a new candidate commit and requires the gate
again.

## 5. Simulation and broadcast

From `contracts/`, simulate both deployments without `--broadcast`:

```sh
forge script script/Deploy.s.sol:Deploy --rpc-url rh_testnet -vvvv
forge script script/Deploy.s.sol:Deploy --rpc-url arb_sepolia -vvvv
```

Review predicted addresses, role checks and gas. Obtain explicit broadcast approval. Then deploy and
finalize one chain at a time:

```sh
forge script script/Deploy.s.sol:Deploy --rpc-url rh_testnet --broadcast
node script/finalize-manifest.mjs 46630 "$RH_TESTNET_RPC_URL"

forge script script/Deploy.s.sol:Deploy --rpc-url arb_sepolia --broadcast
node script/finalize-manifest.mjs 421614 "$ARB_SEPOLIA_RPC_URL"

node script/compare-deployments.mjs
```

`Deploy.s.sol` makes eleven creations, three allowlist calls and three registrations. It deploys
PolicyModule immediately before CopyVault, asserts the predicted vault, reads every immutable back,
and writes only a provisional manifest. The finalizer independently retrieves all 17 receipts from
the target RPC, requires status 1 and the correct sender, validates deployed code/runtime hashes,
and then promotes the manifest.

If a broadcast is interrupted, preserve `contracts/broadcast/` and the pending manifest. Diagnose
the RPC or funding failure and resume the same Forge broadcast artifact. Never start a fresh logical
deployment after some transactions have landed: that would consume different nonces and destroy the
cross-chain address guarantee.

The comparator must report that addresses, roles, strategy hashes and core runtime hashes match.
Any mismatch requires stopping the release; do not manually edit either manifest.

## 6. Source verification

Verification uses the constructor arguments reconstructed from each finalized manifest. Robinhood
uses the official Blockscout testnet API; Arbitrum Sepolia uses `ARBISCAN_API_KEY` without placing it
in a command-line argument.

First inspect the intended eleven submissions without contacting a verifier:

```sh
node script/verify-deployment.mjs 46630 "$RH_TESTNET_RPC_URL" --dry-run
node script/verify-deployment.mjs 421614 "$ARB_SEPOLIA_RPC_URL" --dry-run
```

Then submit and wait for verification:

```sh
node script/verify-deployment.mjs 46630 "$RH_TESTNET_RPC_URL"
node script/verify-deployment.mjs 421614 "$ARB_SEPOLIA_RPC_URL"
```

The command must verify AgentRegistry, TrackRecord, MockUSDG, all three MockStocks, all three feeds,
PolicyModule and CopyVault. Success writes `deployments/evidence/<chain>-verification.json` with the
source commit and public explorer URLs. Open every URL and confirm that the explorer displays the
expected contract name and Solidity source.

## 7. Primary-chain runner and smoke evidence

Do not run demo agents before preparing the smoke follower: the proof assumes a fresh TrackRecord.
The fixed scenario deposits 100 USDG, follows Pulse with a 60 USDG cap, accepts the first tick-3
mNVDA buy, rejects the following mTSLA buy, kills the policy and returns all principal.

### Prepare the follower

Simulate, review, then broadcast:

```sh
cd contracts
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "prepare()" --rpc-url rh_testnet -vvvv
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "prepare()" --rpc-url rh_testnet --broadcast
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "checkPrepared()" --rpc-url rh_testnet
```

The script refuses a dirty starting state. It mints and deposits `100_000_000` raw USDG, follows the
receipt-derived Pulse agent with cap `60_000_000` and slippage `50`, then checks the policy,
allocation, free balance and membership.

### Run Pulse

Configure `runner/.env` for `deployments/46630.json`, an authenticated primary RPC, the public
Robinhood RPC fallback and a new persistent journal. Run ticks in strict order:

```sh
cd runner
npm run runner -- --agent=pulse --tick=0
npm run runner -- --agent=pulse --tick=1
npm run runner -- --agent=pulse --tick=2
npm run runner -- --agent=pulse --tick=3

cd ../contracts
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "checkRunner()" --rpc-url rh_testnet
```

Ticks 0–2 update feeds without fills. Tick 3 records two fills:

- mNVDA: `0.42` tokens at `$130.20`; raw notional `54_684_000`, accepted and mirrored;
- mTSLA: `0.42` tokens at `$416.00`; attempted spend exceeds the 60 USDG cap, so the successful
  `mirrorFill` transaction emits `MirrorRejected` with `CapExceeded` and leaves its position zero.

Never delete or commit the runner journal. Extract only logical transaction IDs, hashes, statuses and
block numbers for evidence; omit `rawTransaction`.

### Prove kill and withdrawal

The exit script first proves there are exactly two fills, both are processed, mNVDA is held, mTSLA is
not held, and today's spend is exactly `54_684_000`. Only then does it unfollow and withdraw:

```sh
cd contracts
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "exit()" --rpc-url rh_testnet -vvvv
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "exit()" --rpc-url rh_testnet --broadcast
forge script script/SmokeLifecycle.s.sol:SmokeLifecycle \
  --sig "checkExited()" --rpc-url rh_testnet
```

The postconditions are: policy inactive, allocation zero, follower absent, vault free balance zero,
and the smoke wallet holding all `100_000_000` raw USDG. The three `check*` calls are fresh reads
against the connected RPC after the relevant receipts have landed; their success, rather than only
the pre-broadcast simulation, is the state proof. Preserve transaction hashes from the Forge receipts
before another run replaces `run-latest.json`.

On Arbitrum Sepolia, perform only read-only code-hash, role, allowlist, agent and immutable-wiring
checks. The full state-changing runner smoke is required on primary chain 46630 only.

## 8. Evidence and handoff tables

### Deployment identity

| Field | Value |
| --- | --- |
| Deployed source commit | `PENDING_STAGE_2` |
| Robinhood manifest hash | `PENDING_STAGE_2` |
| Arbitrum manifest hash | `PENDING_STAGE_2` |
| Cross-chain comparator | `PENDING_STAGE_2` |
| Closure-audit result | `PENDING_STAGE_2` |

### Public addresses

| Item | Robinhood 46630 | Arbitrum Sepolia 421614 |
| --- | --- | --- |
| AgentRegistry | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| TrackRecord | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| PolicyModule | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| CopyVault | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| MockUSDG | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| mNVDA / feed | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| mAAPL / feed | `PENDING_STAGE_2` | `PENDING_STAGE_2` |
| mTSLA / feed | `PENDING_STAGE_2` | `PENDING_STAGE_2` |

### Agent commitments

| Agent | ID | Strategy hash | Model version |
| --- | ---: | --- | --- |
| Pulse | `PENDING_STAGE_2` | `PENDING_STAGE_2` | `pulse-v1.2` |
| Red | `PENDING_STAGE_2` | `PENDING_STAGE_2` | `red-v1.0` |
| Drift | `PENDING_STAGE_2` | `PENDING_STAGE_2` | `drift-v1.0` |

### Contract-side smoke evidence

| Proof | Transaction/explorer link | Required observation |
| --- | --- | --- |
| Fill | `PENDING_STAGE_2` | `FillRecorded` for Pulse/mNVDA |
| Accepted mirror | `PENDING_STAGE_2` | `Mirrored`, size `0.42` |
| Policy rejection | `PENDING_STAGE_2` | `MirrorRejected`, decoded `CapExceeded` |
| Kill/unfollow | `PENDING_STAGE_2` | `PolicyKilled`, `Unfollowed`, fresh inactive/zero/absent reads |
| Withdrawal | `PENDING_STAGE_2` | `Withdrawn(100_000_000)`, full principal returned |

## 9. Frontend engineer checklist

Once every `PENDING_STAGE_2` cell is replaced with verified public data, the frontend owner:

1. Reviews and consumes both committed manifests; no address is copied from chat or a screenshot.
2. Runs `npm run sync:deployments` in `frontend/`; the generated address file is never hand-edited.
3. Runs `npm run check:abi` against the compiled contract artifacts.
4. Configures live mode, WalletConnect and public browser-safe RPC/explorer URLs.
5. Builds with live mode and confirms zero-address failure is no longer triggered.
6. Tests injected-wallet and WalletConnect flows on the intended chain.
7. Confirms 8-decimal price display, 6-decimal USDG amounts, newest-first tape paging, zero-cap
   follow membership and reverted-receipt handling.
8. Uses the evidence links above for the demo and submission rather than generating replacement
   contract transactions.

Jason's handoff is complete when the committed manifests, verified-source URLs and contract-side
evidence are correct. Frontend address generation, browser configuration and wallet/UI smoke testing
remain with the frontend owner.
