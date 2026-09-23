# Mirror full-system audit — 23 September 2026

## Executive verdict

**Release status: BLOCKED.** The audited Solidity core did not yield an exploitable defect, but Mirror as a whole is not deployable or demonstrably complete at this revision. The deployment script, runner, deployment manifests, source verification, and live-chain smoke evidence do not exist on `main`. The frontend also has three high-severity release findings: it renders 8-decimal fill prices as 6-decimal values, treats reverted receipts as confirmations, and ships a production dependency graph with two high and 24 moderate advisories.

This review used the requested rule that **every unresolved finding blocks release**, including low-severity hardening findings. “No exploitable Solidity defect found” is not a guarantee of security and does not override the whole-system blockers.

| Severity | Open | Summary |
|---|---:|---|
| Critical | 0 | — |
| High | 3 | Price integrity, reverted-transaction handling, vulnerable production dependencies |
| Medium | 5 | History pagination, chain configuration, specification/demo drift, CI/test gaps, release configuration |
| Low | 3 | Zero-cap membership inference, mutable CI action tags, missing browser security headers |
| Completion gate | 1 | Deploy script, runner, manifests, verification, and live-chain validation absent |

## Audited snapshot and scope

- Branch: `audit/full-system-2026-09`
- Commit: `d60a371b22472406bb4b913b482a00fd3d1bb275`
- Tree: `36dd9e61fd834d94179143dc3e75b3caba0c060c`
- Base: `origin/main` at the same commit
- Contract toolchain: Foundry 1.7.1, Solidity 0.8.24, optimizer 200 runs, EVM `paris`, `viaIR = false`
- Contract scope: `AgentRegistry`, `TrackRecord`, `PolicyModule`, `CopyVault`, their interfaces, mocks, and all Foundry tests
- Integration scope: current frontend hooks, ABIs, wallet write paths, chain configuration, CI, dependency lockfile, documentation, and tracked release artifacts
- Chain scope: Robinhood Chain testnet 46630 and Arbitrum Sepolia 421614

Stage 1, the local contract audit, is complete. Stages 2 and 3 cannot be completed against this snapshot because the deployer, runner, deployment manifests, and deployed addresses are absent. They remain mandatory release work, not waived audit steps.

### Specification inputs

| Input | SHA-256 |
|---|---|
| `docs/Mirror-PRD-v2.2.pdf` | `a9b096eaf6fefb13cc05a5140c83f17c93ba2d154aaf258a7733eee6c4c19dd3` |
| `contracts/README.md` | `2e074401b4b21c7794dde5dbf8b0fe769b5e0ce2526d85b5044aec8c9f3804b2` |
| `docs/decisions/0001-oracle-feed-approach.md` | `c0ea1896df3c984bac6180116fd5c173c2ab5fdc300f9c28184abcb0f1f43318` |
| `docs/decisions/0002-prd-v2-merge.md` | `fa024a75c18eadcdba817f9b0f9222bfc07b123fc3192bd1597d61748e5fb602` |
| `docs/decisions/0003-copyvault-lifecycle-review.md` | `08ccb56782f9c48e2606380eacc88ea295deff71adfae736da4fbd7aa8ec699e` |
| `docs/demo-script.md` | `f28423b18c5de6e55e7446f20aed0fbfbcd1614ee10056ecded3d97b55a31c80` |

The PRD amendment described by the team is not tracked in this revision, so it could not be treated as an accepted source of truth.

## Findings

### SYS-01 — The deployable system does not exist on `main` — Completion gate

**Evidence.** [`contracts/script/`](../../contracts/script/) contains only `.gitkeep`; [`runner/`](../../runner/) contains only placeholder `.gitkeep` files; [`deployments/`](../../deployments/) contains only `.gitkeep`. Frontend addresses for 46630 and 31337 are all zero, and 421614 has no address entry at all in [`frontend/lib/contracts.ts`](../../frontend/lib/contracts.ts#L19). There is no source-verification record or live smoke transaction.

**Impact.** Constructor prediction and immutable wiring have not been exercised. Role separation, allowlisting, agent IDs, runner retry safety, cross-chain bytecode identity, and the end-to-end deposit/follow/record/mirror/reject/unfollow/withdraw path remain unproved. The application remains on fixtures.

**Required fix.** Before release:

1. Merge the four-identity decision and canonical Pulse, Red, and Drift strategy files.
2. Implement and test `Deploy.s.sol`, including the PolicyModule predicted-vault address, adjacent deployment nonce assumption, post-broadcast immutable read-backs, event-derived agent IDs, token allowlisting, and explicit role-separation assertions.
3. Implement the runner with sign-once/rebroadcast-identical-bytes semantics, a durable journal keyed by logical trade, receipt-status checks, and terminal handling for `InvalidTokenDecimals` and `NotionalOverflow`.
4. Deploy identical bytecode to 46630 and 421614, commit both manifests, verify every contract on both explorers, and populate the frontend from the manifests.
5. Re-run the audit against deployed code and wiring, then execute a dedicated smoke path that leaves explorer evidence for a fill, a `MirrorRejected` log, kill/unfollow reads, and withdrawal.

### FE-01 — Fill prices and PnL are displayed 100× too high — High

**Evidence.** TrackRecord stores price at 8 decimals, but [`useFillEvents.ts`](../../frontend/hooks/useFillEvents.ts#L180) and [`useAgents.ts`](../../frontend/hooks/useAgents.ts#L191) format it with `USDG_DECIMALS`, which is 6 in [`usdg.ts`](../../frontend/lib/usdg.ts#L10). The price is an oracle quote, not a raw USDG token amount.

The PRD example `$128.41` is stored as `12_841_000_000`. Formatting that with six decimals produces `12,841`, not `128.41`. Feed prices, trade volume, realised PnL, PnL percentage inputs, and leaderboard series are consequently wrong once live data is enabled.

**Required fix.** Introduce a distinct `PRICE_DECIMALS = 8`, use it for every fill-price conversion, keep `USDG_DECIMALS = 6` only for balances/caps/notional, and add an end-to-end frontend test for the PRD’s 0.42 mNVDA at $128.41 example.

### FE-02 — Reverted transactions are reported as confirmed — High

**Evidence.** [`useVaultConnection.confirm`](../../frontend/hooks/useVaultConnection.ts#L53) awaits `waitForTransactionReceipt` and discards the returned receipt. Viem resolves this action with a receipt for both successful and reverted mined transactions; it does not throw merely because `status` is `reverted`. Deposit approval/deposit, follow, unfollow, and withdraw all treat `confirm` returning as success. For example, deposit proceeds at [`useDeposit.ts`](../../frontend/hooks/useDeposit.ts#L93) and [`useDeposit.ts`](../../frontend/hooks/useDeposit.ts#L103), while the modals then enter their success states.

**Impact.** A reverted deposit, follow, kill, or withdrawal can be presented as successful. Balance refetches may show unchanged state, but the success message and explorer link still misstate the result. A reverted approval can also be followed by an avoidable deposit attempt.

**Required fix.** Return the receipt from `confirm`, require `receipt.status === "success"`, and throw a typed error for `reverted`. Add tests for reverted approval and each vault write, including the UI/toast result.

Reference: [Viem `waitForTransactionReceipt`](https://viem.sh/docs/actions/public/waitForTransactionReceipt).

### SUP-01 — The production dependency graph has known vulnerabilities — High

**Evidence.** `npm audit --omit=dev` reports **26 production vulnerabilities: 2 high and 24 moderate** across 512 production dependencies. The high paths are:

- `axios` through Coinbase connector dependencies, including [GHSA-gcfj-64vw-6mp9](https://github.com/advisories/GHSA-gcfj-64vw-6mp9).
- `ws` through WalletConnect/Reown’s nested Viem dependency, including the high-severity memory-exhaustion issue [GHSA-96hv-2xvq-fx4p](https://github.com/advisories/GHSA-96hv-2xvq-fx4p).

The remaining advisories include vulnerable WalletConnect/Reown packages, `uuid`, `query-string`, and `decode-uri-component`. The audit database proposes a Wagmi 3 major upgrade for parts of the graph, so an unreviewed `--force` update is not acceptable.

**Required fix.** Upgrade the RainbowKit/Wagmi/connectors stack to a mutually compatible, non-vulnerable set; use narrowly justified overrides only where upstream compatibility permits. Re-test injected wallets, WalletConnect, unknown-chain switching, deposits, follows, kills, and withdrawals. Add `npm audit --omit=dev` as a release gate and require zero unresolved advisories under this audit policy.

### FE-03 — History consumers fetch the oldest page and become stale — Medium

**Evidence.** `TrackRecord.getFillsByAgent` explicitly returns oldest first. The live feed requests offset 0 and limit 50 at [`useFillEvents.ts`](../../frontend/hooks/useFillEvents.ts#L118), so after fill 50 it never backfills newer fills. The agent list similarly requests offset 0 and limit 100 at [`useAgents.ts`](../../frontend/hooks/useAgents.ts#L126), reports `fills.length` as the total, and calculates PnL/volume only from that truncated oldest sample.

Sorting the returned page newest-first cannot recover omitted fills. Sorting only by timestamp also leaves same-block fill ordering ambiguous even though fill IDs provide the exact order.

**Required fix.** Add `fillCountByAgent` to the frontend ABI. For the activity feed, compute `offset = max(count - limit, 0)`, then sort by `fillId` descending. For exact leaderboard PnL and fill totals, page the full history or use a verified indexer; do not label a sample as the total.

### CFG-01 — Default Robinhood RPC and explorer endpoints are wrong — Medium

**Evidence.** [`frontend/lib/chains.ts`](../../frontend/lib/chains.ts#L14) defaults to `testnet-rpc.robinhood.com` and `testnet-explorer.robinhood.com`. Robinhood documents `https://rpc.testnet.chain.robinhood.com` and `https://explorer.testnet.chain.robinhood.com`.

**Impact.** Without local overrides, reads, wallet switching, and every explorer proof link can fail or point at the wrong host.

**Required fix.** Replace both defaults, test them in CI or a release smoke check, and keep an authenticated provider as the runner’s primary transport rather than exposing it through `NEXT_PUBLIC_*`.

Reference: [Robinhood Chain — Connecting](https://docs.robinhood.com/chain/connecting).

### CFG-02 — Frontend release configuration is incomplete and fails open to fixtures — Medium

**Evidence.** There is no tracked frontend `.env.example`. WalletConnect silently falls back to `MIRROR_DEV` in [`frontend/lib/wagmi.ts`](../../frontend/lib/wagmi.ts#L6). All contract addresses are zero, and hooks deliberately use fixture state when addresses are absent.

**Impact.** A nominal “production” build can compile while WalletConnect is unusable and every contract action remains simulated. Build success therefore does not prove live readiness.

**Required fix.** Add a frontend environment template, reject missing production WalletConnect/RPC configuration during build, generate address configuration from committed deployment manifests, and expose an unmistakable fixture-mode banner in non-live builds. A release build must fail if any required address is zero.

### DOC-01 — The accepted specification and operational documentation have drifted — Medium

**Evidence.** No tracked v2.2 amendment records the additive ABI and behaviour already merged. [`contracts/README.md`](../../contracts/README.md#L107) still says PolicyCap and DrainBeyondCap are skipped even though the suite has 218 passes and zero skips; its lifecycle section also says day rollover still requires implementation. [`docs/demo-script.md`](../demo-script.md#L13) says a post-unfollow mirror will be rejected with `PolicyInactive`, but unfollow removes the address from `followersOf`, so that follower is never sent to PolicyModule and no such rejection is emitted.

**Impact.** Reviewers, ABI consumers, deployers, and the demo operator are given mutually inconsistent expectations. The kill beat cannot produce the transaction the script promises.

**Required fix.** Track and approve the PRD amendment; update the test-status table and implementation status; change the kill proof to fresh reads of policy inactive, zero allocation, and follower-list absence. Preserve the distinction between a successful `mirrorFill` carrying `MirrorRejected` and a reverted transaction.

### QA-01 — CI does not enforce the intended depth or integration correctness — Medium

**Evidence.** [`foundry.toml`](../../contracts/foundry.toml#L19) defines a CI profile with 1,000 fuzz runs, but [`contracts.yml`](../../.github/workflows/contracts.yml#L31) invokes plain `forge test -vvv`; Foundry therefore uses the default 256 fuzz runs. Frontend CI runs lint, the ten PnL unit tests, and a build, but has no hook/write-path tests, receipt-status tests, live-unit conversion tests, ABI-drift check, dependency audit, or release-address validation.

**Required fix.** Run contract tests with `FOUNDRY_PROFILE=ci`; add frontend integration tests covering FE-01 through FE-03 and wrong-chain/write failures; generate or compare frontend ABI fragments from Foundry artifacts; and gate production dependencies and non-zero release addresses in CI.

### FE-04 — The UI cannot recognise an existing zero-cap follow — Low

**Evidence.** The contract intentionally treats a zero-cap membership as a real follow, independently of principal. The frontend infers `alreadyFollowing` from `allocationOf > 0` at [`useFollow.ts`](../../frontend/hooks/useFollow.ts#L84). A zero-cap follow made outside this UI therefore appears inactive and the next follow attempt reverts `AlreadyFollowing`.

**Required fix.** Read membership directly—through `followersOf`, an indexed event state, or a coordinated `isFollowing` view—and test zero-cap membership. UI input policy may still forbid creating a new zero-cap follow.

### CI-01 — Third-party GitHub Actions are not pinned to immutable commits — Low

**Evidence.** Both workflows use tags such as `actions/checkout@v4`, `actions/setup-node@v4`, and `foundry-rs/foundry-toolchain@v1` rather than full commit SHAs.

**Impact.** A moved or compromised upstream tag can change code executed with repository workflow permissions.

**Required fix.** Pin each third-party action to a reviewed full-length commit SHA and use Dependabot or Renovate for controlled updates.

Reference: [GitHub Actions security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions).

### WEB-01 — No browser security headers are configured — Low

**Evidence.** [`frontend/next.config.ts`](../../frontend/next.config.ts#L1) is empty. The app has no Content Security Policy, frame-ancestor restriction, Referrer-Policy, Permissions-Policy, or explicit content-type protections.

**Impact.** Current source inspection found no direct HTML injection sink, but a wallet application benefits from defense in depth against future injection, clickjacking, and data leakage.

**Required fix.** Add and test a production header policy, beginning with a CSP compatible with RainbowKit/WalletConnect, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, and `X-Content-Type-Options: nosniff`.

## Solidity assessment

No open Solidity finding was identified in the audited revision. That conclusion is bounded to the source and local environment above; it does not cover missing deployment logic, a future runner, or live-chain configuration.

### Test and analysis results

| Check | Result |
|---|---|
| Format / build / sizes | Pass |
| Baseline Foundry suite | **218 passed, 0 failed, 0 skipped** across 22 suites |
| Production coverage | **100% functions, branches, and lines**: 37/37 functions, 48/48 branches, 186/186 lines |
| High-run fuzz | **23 properties × 10,000 runs = 230,000 cases**, seed `0x5eed`; all pass |
| Deep invariants | 19 invariants at 512 runs × 256 depth under each of `0x1`, `0xdeadbeef`, and `0x5eed`; **57 invariant results pass**, zero reverts/discards |
| Mutation probes | 6/6 killed |
| Slither | 102 detectors; five signals, all triaged as non-actionable for this implementation |
| Compiler bug review | Four version-matching entries reviewed; none exploitable in the production source/configuration |
| Secret scan | Gitleaks 8.30.1 across 81 commits; no leaks found |
| Deterministic rebuild | Production deployed-bytecode hashes identical across clean rebuilds |
| Worst-case bounded loop | 50-follower buy **3,137,690 gas**; sell **831,008 gas** under isolated measurement |

### Contract sizes

| Contract | Runtime bytes | Initcode bytes |
|---|---:|---:|
| AgentRegistry | 2,148 | 2,180 |
| TrackRecord | 2,918 | 3,199 |
| PolicyModule | 2,308 | 2,676 |
| CopyVault | 6,675 | 7,214 |

All are comfortably below EVM code-size limits.

### Mutation evidence

| Deliberate regression | Test response |
|---|---|
| Remove TrackRecord `onlyRunner` | Runner-auth fuzz fails |
| Remove CopyVault replay guard | No-eligible-follower replay test fails |
| Let one follower’s policy revert escape | Mirror-isolation test fails |
| Reset same-day spend on re-follow | Spend-retention test fails |
| Stop incrementing the position epoch on unfollow | Position-clearing lifecycle test fails |
| Stop reserving principal from free balance | Principal-reserve test fails |

All mutations were made only in an isolated temporary clone and reversed. Production source in this audit branch remains unchanged.

### Static-analysis triage

- Slither’s reentrancy signal on `mirrorFill` is mitigated by `nonReentrant`; every state-changing CopyVault entry is guarded. The immutable production PolicyModule contains no external call opcode. Correct deployment wiring is still mandatory.
- The external call inside the follower loop is intentional and bounded at 50; isolated gas measurement confirms headroom against a 30 million gas block.
- `buyNotional` defaults to zero only on sells, where PolicyModule does not consume cap.
- The unused low limb from `Math.mul512` is intentional; only the high limb is needed for the overflow guard.
- Cyclomatic complexity reflects the bounded mirror loop’s documented early exits and is fully branch-covered.

### Solidity compiler advisory review

The official Solidity bug list was evaluated against 0.8.24 and this configuration:

- `SOL-2026-5` memory byte-array element deletion: not applicable; production code never deletes an element of a memory byte array.
- `SOL-2026-4` and `SOL-2026-2` mutual-recursion spill issues: not applicable; `viaIR` is disabled and there is no recursion.
- `SOL-2025-1` storage array write at the `2^256` slot boundary: dynamic arrays exist, but the trigger state is unreachable under gas-bounded execution.

Reference: [Solidity compiler bug list](https://github.com/ethereum/solidity/blob/develop/docs/bugs.json).

## Explicitly accepted design assumptions

These are not newly discovered defects, but they must remain visible in the final threat model:

- The V1 runner is trusted for price, oracle round, execution truth, and completeness. TrackRecord proves immutability only after recording.
- The runner addresses in TrackRecord and CopyVault are immutable. Key compromise requires redeployment; the key must be separate from deployer, PolicyModule admin, and agent registrar.
- TrackRecord has no contract-side duplicate-fill guard. The runner must sign once, persist the raw transaction/logical trade, and only rebroadcast identical bytes.
- `maxSlippageBps` is stored and displayed but not enforced in V1.
- CopyVault supports exact-transfer, non-rebasing USDG and exactly 18-decimal stock tokens.
- The 50-follower cap bounds mirror gas but does not prevent 50 addresses from occupying every slot. Zero-cap follows make this possible without deposited USDG on testnet.
- `InvalidTokenDecimals` and `NotionalOverflow` leave a fill unprocessed and must be terminal operator alerts, not infinite runner retries.

Any change to one of these assumptions requires a new threat-model and test review.

## Remediation and audit closure plan

1. **Frontend integrity PR:** fix FE-01, FE-02, FE-03, FE-04, add hook/write tests, correct chain endpoints, and add strict release configuration.
2. **Dependency/CI hardening PR:** resolve all production advisories; activate the Foundry CI profile; add audit, ABI-drift, address, action-SHA, and browser-header gates.
3. **Specification PR:** commit the accepted v2.2 amendment and repair README/demo claims.
4. **Deployment PR:** merge identities and reproducible strategies, implement `Deploy.s.sol`, test nonce prediction and immutable read-backs, and produce a dry-run artifact.
5. **Runner PR:** implement transaction journaling, deterministic retries, error classification, receipt checks, and record-then-mirror sequencing with tests.
6. **Live deployment:** deploy and verify identical bytecode on 46630 and 421614; commit manifests populated from receipts, not assumed IDs.
7. **Closure audit:** compare on-chain bytecode and immutable wiring, run fork/live integration tests, execute smoke transactions, verify explorer links/log decoding, re-run the complete local matrix, and close every finding with evidence.

Until all seven steps are complete, the appropriate status is **contract core validated locally; system release blocked**.
