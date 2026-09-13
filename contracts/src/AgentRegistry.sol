// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry
/// @notice Agent metadata registry — PRD Section 4.1. Owner: Isaac.
/// @dev STUB (Day 2). Storage layout and access control are in place; the bodies land Day 4
///      (Sun 14 Sep) per the PRD execution plan. Every mutating function reverts until then so
///      no caller can mistake this for working logic.
contract AgentRegistry is IAgentRegistry {
    error NotImplemented();

    /// @dev agentId => Agent. agentId is 1-indexed; 0 is reserved as "no agent".
    mapping(uint256 => Agent) internal _agents;

    uint256 internal _agentCount;

    modifier onlyAgentOwner(uint256 agentId) {
        if (_agents[agentId].owner != msg.sender) revert NotAgentOwner();
        _;
    }

    /// @inheritdoc IAgentRegistry
    function registerAgent(string calldata name, bytes32 strategyHash, string calldata modelVersion)
        external
        returns (uint256 agentId)
    {
        // TODO(Day 4): validate non-empty name -> EmptyName; increment _agentCount; persist
        // Agent{owner: msg.sender, ..., registeredAt: uint64(block.timestamp), active: true};
        // emit AgentRegistered.
        name;
        strategyHash;
        modelVersion;
        revert NotImplemented();
    }

    /// @inheritdoc IAgentRegistry
    function deactivateAgent(uint256 agentId) external onlyAgentOwner(agentId) {
        // TODO(Day 4): set active = false; emit AgentDeactivated.
        revert NotImplemented();
    }

    /// @inheritdoc IAgentRegistry
    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    /// @inheritdoc IAgentRegistry
    function agentCount() external view returns (uint256) {
        return _agentCount;
    }
}
