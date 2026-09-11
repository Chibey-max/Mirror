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

    function registerAgent(string calldata name, bytes32 strategyHash, string calldata modelVersion)
        external
        returns (uint256 agentId);

    /// @dev onlyAgentOwner
    function deactivateAgent(uint256 agentId) external;

    function getAgent(uint256 agentId) external view returns (Agent memory);

    function agentCount() external view returns (uint256);
}
