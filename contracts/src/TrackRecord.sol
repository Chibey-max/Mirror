// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {ITrackRecord} from "./interfaces/ITrackRecord.sol";

/// @title TrackRecord
/// @notice Append-only ledger of agent fills — PRD v2.2 Section 5.2. Owner: Isaac.
///
/// @dev NON-NEGOTIABLE: this contract has no `editFill`, `deleteFill`, or `setFill` function,
///      and never will — under any name, including behind an admin modifier. `_fills` is written
///      exactly once per fillId in `recordFill` and is never reassigned anywhere else in this
///      file. The guarantee is enforced by OMISSION: a judge reading this source and finding no
///      mutation path IS the product's verifiability claim (PRD Section 1.4).
///
/// @dev PARTIAL. The PRD v2.2 surface and constructor are in place; the recordFill and
///      getFillsByAgent bodies are not implemented yet. The Fill struct and storage layout are final.
contract TrackRecord is ITrackRecord {
    error NotImplemented();
    error ZeroRunner();

    /// @notice agentRegistry is the zero address or has no code.
    /// @dev Checking for code, not just zero, turns a mistyped registry address (or, with a wallet
    ///      runner, swapped constructor arguments) into a revert at deploy instead of every recordFill
    ///      reverting later with empty data. It cannot prove this is the right registry: the deploy
    ///      script reads registry() and runner() back after broadcast for that.
    error ZeroRegistry();

    /// @dev The AgentRegistry every recordFill checks the agent against. Immutable, like runner.
    IAgentRegistry public immutable registry;

    /// @dev The Agent Runner's signer. Immutable: there is deliberately no setRunner —
    ///      a rotatable writer would weaken the append-only story. Redeploy to rotate.
    address public immutable runner;

    /// @dev fillId => Fill. fillId is 1-indexed; 0 is reserved as "no fill".
    mapping(uint256 => Fill) internal _fills;

    /// @dev agentId => fillIds, in insertion order. Append-only, mirrors _fills.
    mapping(uint256 => uint256[]) internal _fillsByAgent;

    uint256 internal _fillCount;

    modifier onlyRunner() {
        if (msg.sender != runner) revert NotRunner();
        _;
    }

    constructor(address agentRegistry, address runner_) {
        // The zero address has no code, so this one check covers PRD v2.2's zero-address check too.
        if (agentRegistry.code.length == 0) revert ZeroRegistry();
        if (runner_ == address(0)) revert ZeroRunner();
        registry = IAgentRegistry(agentRegistry);
        runner = runner_;
    }

    /// @inheritdoc ITrackRecord
    function recordFill(uint256 agentId, address token, bool isBuy, uint256 size, uint256 price, bytes32 oracleRoundId)
        external
        onlyRunner
        returns (uint256 fillId)
    {
        // TODO(Day 4): fillId = ++_fillCount; write _fills[fillId] ONCE; push to _fillsByAgent;
        // emit FillRecorded with uint64(block.timestamp).
        agentId;
        token;
        isBuy;
        size;
        price;
        oracleRoundId;
        revert NotImplemented();
    }

    /// @inheritdoc ITrackRecord
    function getFill(uint256 fillId) external view returns (Fill memory) {
        return _fills[fillId];
    }

    /// @inheritdoc ITrackRecord
    function getFillsByAgent(uint256 agentId, uint256 offset, uint256 limit) external view returns (Fill[] memory) {
        // TODO(Day 4): bounds-clamp offset/limit against _fillsByAgent[agentId].length and
        // hydrate the page from _fills. Must not revert on an out-of-range offset — the
        // AgentTapeTable paginates blind (PRD Section 5.2).
        agentId;
        offset;
        limit;
        return new Fill[](0);
    }

    /// @inheritdoc ITrackRecord
    function fillCount() external view returns (uint256) {
        return _fillCount;
    }

    /// @inheritdoc ITrackRecord
    function fillCountByAgent(uint256 agentId) external view returns (uint256) {
        return _fillsByAgent[agentId].length;
    }
}
