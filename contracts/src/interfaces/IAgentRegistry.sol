// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgentRegistry
/// @notice Frozen ABI — PRD Section 4.1. Owner: Isaac.
/// @dev Signatures here are frozen as of the Day-3 ABI freeze (Sat 13 Sep 2026, 09:00 SGT).
///      Changing anything in this file after that point requires a whole-team sync, not a
///      unilateral edit — David and Patrick's frontend is generated against these exact types.
interface IAgentRegistry {
    struct Agent {
        address owner;
        string name;
        bytes32 strategyHash;
        string modelVersion;
        uint64 registeredAt;
        bool active;
    }

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string name, bytes32 strategyHash);
    event AgentDeactivated(uint256 indexed agentId);

    error NotAgentOwner();
    error EmptyName();
    /// @notice deactivateAgent was called on an agent that is already inactive.
    /// @dev ADDED AFTER THE FREEZE (15 Sep 2026, Isaac) — pending whole-team sign-off in the PRD v2.2
    ///      amendment. Deactivation is one-way, so a second call is a caller mistake and is rejected
    ///      rather than silently re-emitting AgentDeactivated. Same signature as TrackRecord's
    ///      AgentInactive(uint256) in PRD v2.1 Section 5.2, so both decode identically.
    error AgentInactive(uint256 agentId);

    function registerAgent(string calldata name, bytes32 strategyHash, string calldata modelVersion)
        external
        returns (uint256 agentId);

    /// @dev onlyAgentOwner
    function deactivateAgent(uint256 agentId) external;

    function getAgent(uint256 agentId) external view returns (Agent memory);

    function agentCount() external view returns (uint256);
}
