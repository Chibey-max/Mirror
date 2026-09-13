// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITrackRecord} from "./interfaces/ITrackRecord.sol";

/// @title TrackRecord
/// @notice Append-only ledger of agent fills — PRD Section 4.2. Owner: Isaac.
///
/// @dev NON-NEGOTIABLE: this contract has no `editFill`, `deleteFill`, or `setFill` function,
///      and never will — under any name, including behind an admin modifier. `_fills` is written
///      exactly once per fillId in `recordFill` and is never reassigned anywhere else in this
///      file. The guarantee is enforced by OMISSION: a judge reading this source and finding no
///      mutation path IS the product's verifiability claim (PRD Section 1.4).
///
/// @dev STUB (Day 2). The Fill struct and storage layout are final; the recordFill body lands
///      Day 4 (Sun 14 Sep) per the PRD execution plan.
contract TrackRecord is ITrackRecord {
    error NotImplemented();
    error ZeroRunner();

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

    constructor(address runner_) {
        if (runner_ == address(0)) revert ZeroRunner();
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
}
