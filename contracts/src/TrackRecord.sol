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
///      mutation path IS the product's verifiability claim (PRD v1.0 Section 1.4).
///
/// @dev WHAT THIS CONTRACT ENFORCES
///        - A fill, once recorded, never changes and is never removed.
///        - fillIds run 1, 2, 3... across all agents and are never reused; id 0 is never a fill, so
///          an unrecorded id reads as the all-zero Fill without reverting.
///        - Only the runner can record, and the runner cannot be changed after deployment.
///        - Every fill belongs to an agent that was registered and active in AgentRegistry when it
///          was recorded, so no fill can predate its agent.
///        - A fill never has a zero token, zero size or zero price.
///        - fillId and timestamp are set here, never by the caller; timestamp is the block time of
///          recording.
///        - Exactly one FillRecorded event per fill, carrying the stored values.
///        - No read ever reverts: getFillsByAgent clamps any offset and limit to the agent's tape.
///        - Nothing leaves this contract except one read-only call to the registry, and it accepts no ETH.
///
/// @dev WHAT IT TRUSTS THE RUNNER FOR (a stated V1 decision, PRD v2.2 Section 5.2, oracle option A)
///        - price and oracleRoundId are stored exactly as the runner relays them; nothing here checks
///          them against a price feed.
///        - Which trades get recorded: the contract cannot tell whether a trade was left out, and it
///          does not verify that any trade executed anywhere.
contract TrackRecord is ITrackRecord {
    /// @notice runner_ is the zero address.
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
    /// @dev Checks run in a fixed order: caller, then the three values in parameter order, then the
    ///      agent. The cheap checks come first, so a refused call never reaches the registry.
    function recordFill(uint256 agentId, address token, bool isBuy, uint256 size, uint256 price, bytes32 oracleRoundId)
        external
        onlyRunner
        returns (uint256 fillId)
    {
        // A fill can never be corrected once recorded, so reject values that cannot describe a trade.
        if (token == address(0)) revert ZeroToken();
        if (size == 0) revert ZeroSize();
        if (price == 0) revert ZeroPrice();

        // One read, two checks (PRD v2.2 Section 5.2). getAgent never reverts: an unknown id returns
        // the zero struct, whose owner is address(0). The call is a STATICCALL, so it cannot reenter.
        IAgentRegistry.Agent memory agent = registry.getAgent(agentId);
        if (agent.owner == address(0)) revert AgentNotFound(agentId);
        if (!agent.active) revert AgentInactive(agentId);

        // Pre-increment: the first fill is 1, so id 0 is never written and always reads as "no fill".
        fillId = ++_fillCount;

        // The uint64 cast cannot truncate: block.timestamp stays below 2^64 for ~584 billion years.
        uint64 timestamp = uint64(block.timestamp);

        // The only write to _fills anywhere in this contract, on a fillId that has never been used.
        _fills[fillId] = Fill({
            fillId: fillId,
            agentId: agentId,
            token: token,
            isBuy: isBuy,
            size: size,
            price: price,
            timestamp: timestamp,
            oracleRoundId: oracleRoundId
        });
        _fillsByAgent[agentId].push(fillId);

        emit FillRecorded(fillId, agentId, token, isBuy, size, price, timestamp, oracleRoundId);
    }

    /// @inheritdoc ITrackRecord
    function getFill(uint256 fillId) external view returns (Fill memory) {
        return _fills[fillId];
    }

    /// @inheritdoc ITrackRecord
    /// @dev Returns the agent's fills oldest first: up to `limit` of them, starting at position `offset`
    ///      in that agent's own list. Never reverts, whatever the arguments: an offset at or past the end,
    ///      a zero limit, or an unknown agent returns an empty page, because the AgentTapeTable pages
    ///      without knowing the tape's length (PRD v1.0 Section 5.2). A very large page can still exceed an RPC
    ///      node's eth_call gas cap; clients should page with fillCountByAgent.
    function getFillsByAgent(uint256 agentId, uint256 offset, uint256 limit) external view returns (Fill[] memory) {
        uint256[] storage ids = _fillsByAgent[agentId];
        uint256 count = ids.length;
        if (offset >= count) return new Fill[](0);

        // Clamp before any addition or allocation: offset + limit could overflow, and an unclamped
        // limit would try to allocate a huge array.
        uint256 remaining = count - offset;
        if (limit > remaining) limit = remaining;

        Fill[] memory page = new Fill[](limit);
        for (uint256 i = 0; i < limit; i++) {
            // offset + i < offset + limit <= count, so this cannot overflow or run past the list.
            page[i] = _fills[ids[offset + i]];
        }
        return page;
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
