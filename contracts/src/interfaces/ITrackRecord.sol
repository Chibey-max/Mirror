// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./IAgentRegistry.sol";

/// @title ITrackRecord
/// @notice Frozen ABI — PRD v2.2 Section 5.2. Owner: Isaac.
///
/// @dev NON-NEGOTIABLE (PRD v1.0 Section 4.2, unchanged in v2.2): no `editFill`, `deleteFill`, or `setFill` function
///      may exist anywhere in this interface or its implementation, under any name, ever —
///      including behind an admin modifier. The append-only guarantee is enforced by OMISSION.
///      A judge reading this file and finding no mutation path is the entire point of the
///      product's first claim (verifiability). Do not add one "temporarily" for testing.
interface ITrackRecord {
    struct Fill {
        uint256 fillId;
        uint256 agentId;
        address token;
        bool isBuy;
        uint256 size; // in the token's smallest unit
        uint256 price; // 8-decimal, matches MockAggregatorV3
        uint64 timestamp; // block time when the fill was recorded, not a verified execution time
        bytes32 oracleRoundId; // bytes32(uint256(roundId)) from the feed's latestRoundData(), as relayed by the runner
    }

    event FillRecorded(
        uint256 indexed fillId,
        uint256 indexed agentId,
        address indexed token,
        bool isBuy,
        uint256 size,
        uint256 price,
        uint64 timestamp,
        bytes32 oracleRoundId
    );

    error NotRunner();

    /// @notice recordFill was called for an agentId that AgentRegistry has never assigned.
    error AgentNotFound(uint256 agentId);

    /// @notice recordFill was called for an agent that has been deactivated. Same signature as
    ///         AgentRegistry's AgentInactive(uint256), so one ABI entry decodes both.
    error AgentInactive(uint256 agentId);

    /// @notice recordFill was called with token == address(0).
    /// @dev ZeroToken, ZeroSize and ZeroPrice were ADDED AFTER PRD v2.2 (16 Sep 2026, Isaac; agreed
    ///      with Jason) — pending the PRD amendment. A fill can never be corrected once recorded, so
    ///      values that cannot describe a real trade are rejected before they reach the tape.
    error ZeroToken();

    /// @notice recordFill was called with size == 0.
    error ZeroSize();

    /// @notice recordFill was called with price == 0.
    error ZeroPrice();

    /// @dev onlyRunner
    function recordFill(uint256 agentId, address token, bool isBuy, uint256 size, uint256 price, bytes32 oracleRoundId)
        external
        returns (uint256 fillId);

    function getFill(uint256 fillId) external view returns (Fill memory);

    function getFillsByAgent(uint256 agentId, uint256 offset, uint256 limit) external view returns (Fill[] memory);

    function fillCount() external view returns (uint256);

    function fillCountByAgent(uint256 agentId) external view returns (uint256);

    /// @notice The AgentRegistry this TrackRecord validates fills against.
    /// @dev NOT a new function. `TrackRecord.registry` has always been `IAgentRegistry public immutable`, so this
    ///      getter is already in the deployed ABI — the interface simply never declared it. Declaring it changes no
    ///      bytecode, no selector and no ABI entry; it only lets a caller holding an `ITrackRecord` read the registry
    ///      without casting through a locally declared shim interface.
    ///
    ///      Added 21 Sep 2026 for CopyVault, which needs the registry to reject follows of unknown or deactivated
    ///      agents (Jason's PR #14). Deliberately read-only: there is no setter here and none on the implementation,
    ///      because the registry is immutable and the deploy script reads it back after broadcast.
    function registry() external view returns (IAgentRegistry);
}
