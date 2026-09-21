# 0003 — CopyVault lifecycle review decisions

Date: 21 September 2026. Owner: Jason. Applies to PR #14 and amends PRD v2.2 §7.7.

- At most **50 active followers per agent**, including zero-cap follows. `MAX_FOLLOWERS_PER_AGENT()` exposes the limit. `FollowerLimitReached(uint256 agentId)` rejects the next follow before state changes or policy calls. Unfollow releases a slot. This bounds list size but does not prevent someone occupying all slots. Worst-case mirror gas must be measured before deployment; 50 is a V1 capacity choice, not a measured block-gas guarantee.
- A new follow requires a registered, active agent from TrackRecord's registry. Unknown and inactive agents revert `AgentNotFound(uint256 agentId)` and `AgentInactive(uint256 agentId)`. Unfollow never checks agent activity, so deactivation cannot block exit. Validation order is AlreadyFollowing, InsufficientBalance, follower limit, agent existence, agent activity.
- Every successful follow saves the current global `TrackRecord.fillCount()`. Only fills with strictly greater IDs are eligible for that follow. Re-follow captures a new boundary; unfollow clears it. IDs distinguish transactions even within the same block timestamp. Future mirroring skips ineligible followers and marks a successfully processed fill as mirrored even when none were eligible. This PR stores the boundary; mirror execution remains pending.
- Constructor code checks now use `ZeroTrackRecord()`, `ZeroPolicyModule()`, and `ZeroUsdg()`. These errors cover both zero and nonzero code-less addresses. They do not prove the dependency has the intended code or wiring.
- `isMirrored` returns false while all mirror writes are unavailable. `mirrorFill` continues to revert NotImplemented until implemented.
- Zero-amount deposits/withdrawals and zero-cap follows remain permitted. Position epochs clear positions in constant time on unfollow. Same-day policy spend must survive re-follow.
- The three withdrawal acceptance tests now run in their original required-test file. Their allocation case uses the policy double until real policy integration is available.
- Isaac owns the PolicyModule interface change in PR #15. Jason owns replacing the removed stub-specific expectation with real vault/policy integration tests when incorporating that PR, including idempotent kill and same-day spend retention. No PolicyModule ABI changes are included here.
- CI pins Foundry v1.7.1, matching the local formatter/compiler driver. All contributors should use the same release. The Solidity compiler remains pinned by foundry.toml.

The existing frontend CopyVault ABI includes the added constructor/admission errors and capacity getter. No existing function or event signature changes. These additive ABI changes must be included in the team's PRD amendment review.
