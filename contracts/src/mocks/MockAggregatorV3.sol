// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TESTNET ONLY: owner-controlled 8-decimal feed with Chainlink-compatible read methods.
/// @dev No round exists until setPrice succeeds. Every update creates a new round, even when
///      the price or block timestamp is unchanged. Round IDs are local to this deployment.
contract MockAggregatorV3 is Ownable {
    error InvalidPrice();
    error NoDataPresent();

    struct Round {
        int256 answer;
        uint256 timestamp;
    }
    mapping(uint80 => Round) private _rounds;
    uint80 private _latestRound;

    constructor(address admin_) Ownable(admin_) {}

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "Mirror mock USD price feed";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function setPrice(int256 newPrice) external onlyOwner {
        if (newPrice <= 0) revert InvalidPrice();
        uint80 roundId = ++_latestRound;
        _rounds[roundId] = Round(newPrice, block.timestamp);
    }

    function getRoundData(uint80 roundId) public view returns (uint80, int256, uint256, uint256, uint80) {
        if (roundId == 0 || roundId > _latestRound) revert NoDataPresent();
        Round memory round = _rounds[roundId];
        return (roundId, round.answer, round.timestamp, round.timestamp, roundId);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return getRoundData(_latestRound);
    }
}
