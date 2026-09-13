// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITrackRecord
/// @notice Frozen ABI — PRD Section 4.2. Owner: Isaac.
///
/// @dev NON-NEGOTIABLE (PRD Section 4.2): no `editFill`, `deleteFill`, or `setFill` function
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
        uint64 timestamp;
        bytes32 oracleRoundId;
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

    /// @dev onlyRunner
    function recordFill(uint256 agentId, address token, bool isBuy, uint256 size, uint256 price, bytes32 oracleRoundId)
        external
        returns (uint256 fillId);

    function getFill(uint256 fillId) external view returns (Fill memory);

    function getFillsByAgent(uint256 agentId, uint256 offset, uint256 limit) external view returns (Fill[] memory);

    function fillCount() external view returns (uint256);
}
