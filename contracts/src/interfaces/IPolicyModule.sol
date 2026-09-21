// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPolicyModule
/// @notice Frozen ABI — PRD v2.2 Section 7.8. Owner: Isaac.
/// @dev The custom errors below are load-bearing for the frontend. Under v2.2 Section 7.1 a
///      rejected mirror no longer reverts a transaction: CopyVault catches the revert and logs
///      `MirrorRejected(user, agentId, fillId, reason)`, and Patrick's `usePolicyError` decodes
///      these selectors out of that `reason` field. Renaming an error or reordering its
///      parameters silently breaks PolicyRejectBanner — the demo's centerpiece.
interface IPolicyModule {
    struct Policy {
        uint256 maxNotionalPerDay;
        uint256 maxSlippageBps;
        bool active;
    }

    event PolicySet(address indexed user, uint256 indexed agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps);
    event PolicyKilled(address indexed user, uint256 indexed agentId);

    /// @notice `attempted` is the running total — today's spend plus this trade — not the trade on its own,
    ///         and the cap is only exceeded when `attempted > cap`, so landing exactly on it is allowed (v2.2 §7.6).
    ///         Both values are raw 6-decimal USDG (§8).
    /// @notice UI copy: "Blocked: this trade would take today's total for this agent to ${attempted}, over your
    ///         ${cap} daily cap."
    error CapExceeded(uint256 attempted, uint256 cap);
    /// @notice UI copy: "Blocked: {symbol} isn't on the approved list for copy-trading yet."
    error TokenNotAllowed(address token);
    /// @notice UI copy: "You're not currently following this agent (or you've already killed the follow)."
    error PolicyInactive();
    error OnlyVault();

    /// @dev onlyVault
    function setPolicy(address user, uint256 agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps) external;

    /// @notice Gate for one follower's copy of one fill. Reverts to reject; returns nothing when allowed.
    /// @dev onlyVault. Checks run in this order: `PolicyInactive` (a killed follow is rejected in both
    ///      directions), then `TokenNotAllowed`, then — for buys only — the daily cap. Sells never consume
    ///      the cap, because the cap exists to limit risk added, not risk being removed (v2.2 §7.5).
    /// @param notional The trade's value in raw 6-decimal USDG, computed by CopyVault (§8).
    /// @param isBuy True for a buy, which consumes today's cap; false for a sell, which does not.
    function checkAndConsume(address user, uint256 agentId, address token, uint256 notional, bool isBuy) external;

    /// @dev onlyVault
    function kill(address user, uint256 agentId) external;

    /// @dev onlyAdmin — called once per demo token at deploy
    function setTokenAllowlist(address token, bool allowed) external;

    function isTokenAllowed(address token) external view returns (bool);

    function getPolicy(address user, uint256 agentId) external view returns (Policy memory);

    function spentToday(address user, uint256 agentId) external view returns (uint256);
}
