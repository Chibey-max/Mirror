// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry
/// @notice Agent identity registry — PRD v2.1 Section 5.1. Owner: Isaac.
///
/// @dev Every other contract and screen refers to an agent only by agentId, and this contract is
///      the only place that number is defined. It guarantees:
///        - ids run 1..agentCount, are assigned sequentially, and are never reused; id 0 never exists.
///        - an agent is registered if and only if its owner is non-zero. getAgent never reverts: an
///          unknown id returns the zero struct, which is exactly what TrackRecord's AgentNotFound
///          check reads (PRD v2.1 Section 5.2).
///        - identity is permanent. owner, name, strategyHash, modelVersion and registeredAt are
///          written once at registration and have no setter, under any name — strategyHash is a
///          commitment to a strategy, and a track record must not be re-attributable after the fact.
///        - there is no admin, no upgrade path, no external call, and no way to receive ETH.
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
        if (bytes(name).length == 0) revert EmptyName();

        // Pre-increment: the first agent is 1, so id 0 is never written and always reads as "no agent".
        agentId = ++_agentCount;

        // The only write to _agents[agentId] outside deactivateAgent, which touches `active` alone.
        // The uint64 cast cannot truncate: block.timestamp stays below 2^64 for ~584 billion years.
        _agents[agentId] = Agent({
            owner: msg.sender,
            name: name,
            strategyHash: strategyHash,
            modelVersion: modelVersion,
            registeredAt: uint64(block.timestamp),
            active: true
        });

        emit AgentRegistered(agentId, msg.sender, name, strategyHash);
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
