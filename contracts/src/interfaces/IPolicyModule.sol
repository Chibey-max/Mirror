// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPolicyModule
/// @notice Frozen ABI — PRD Section 4.3. Owner: Isaac.
/// @dev The custom errors below are load-bearing for the frontend: Patrick decodes them with
///      viem and renders the exact copy in PRD Section 4.6. Renaming an error or reordering its
///      parameters silently breaks PolicyRejectBanner — the demo's centerpiece.
interface IPolicyModule {
    struct Policy {
        uint256 maxNotionalPerDay;
        uint256 maxSlippageBps;
        bool active;
    }

    event PolicySet(address indexed user, uint256 indexed agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps);
    event PolicyKilled(address indexed user, uint256 indexed agentId);

    /// @notice UI copy: "Blocked: this trade would move ${attempted} but your daily cap for this agent is ${cap}."
    error CapExceeded(uint256 attempted, uint256 cap);
    /// @notice UI copy: "Blocked: {symbol} isn't on the approved list for copy-trading yet."
    error TokenNotAllowed(address token);
    /// @notice UI copy: "You're not currently following this agent (or you've already killed the follow)."
    error PolicyInactive();
    error OnlyVault();

    /// @dev onlyVault
    function setPolicy(address user, uint256 agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps) external;

    /// @dev onlyVault
    function checkAndConsume(address user, uint256 agentId, address token, uint256 notional) external returns (bool);

    /// @dev onlyVault
    function kill(address user, uint256 agentId) external;

    /// @dev onlyAdmin — called once per demo token at deploy
    function setTokenAllowlist(address token, bool allowed) external;

    function isTokenAllowed(address token) external view returns (bool);

    function getPolicy(address user, uint256 agentId) external view returns (Policy memory);

    function spentToday(address user, uint256 agentId) external view returns (uint256);
}
