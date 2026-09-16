// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStock} from "../src/mocks/MockStock.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MocksTest is Test {
    MockAggregatorV3 oracle;

    function setUp() public {
        oracle = new MockAggregatorV3(address(this));
    }

    function test_PublicMintAndDecimals() public {
        MockUSDG usd = new MockUSDG();
        MockStock stock = new MockStock("Mock Apple", "AAPL");
        vm.prank(address(123));
        usd.mint(address(456), 10e6);
        vm.prank(address(123));
        stock.mint(address(456), 10e18);
        assertEq(usd.decimals(), 6);
        assertEq(stock.decimals(), 18);
        assertEq(stock.name(), "Mock Apple");
        assertEq(stock.symbol(), "AAPL");
        assertEq(usd.balanceOf(address(456)), 10e6);
        assertEq(stock.balanceOf(address(456)), 10e18);
    }

    function test_NoDataBeforeFirstUpdateAndUnknownRound() public {
        vm.expectRevert(MockAggregatorV3.NoDataPresent.selector);
        oracle.latestRoundData();
        vm.expectRevert(MockAggregatorV3.NoDataPresent.selector);
        oracle.getRoundData(0);
        oracle.setPrice(100e8);
        vm.expectRevert(MockAggregatorV3.NoDataPresent.selector);
        oracle.getRoundData(2);
    }

    function test_NewRoundEvenForIdenticalPriceAndTimestamp() public {
        vm.warp(100);
        oracle.setPrice(100e8);
        oracle.setPrice(100e8);
        (uint80 round, int256 answer, uint256 started, uint256 updated, uint80 answered) = oracle.latestRoundData();
        assertEq(round, 2);
        assertEq(answer, 100e8);
        assertEq(started, 100);
        assertEq(updated, 100);
        assertEq(answered, round);
        vm.warp(200);
        oracle.setPrice(200e8);
        (round, answer, started, updated, answered) = oracle.getRoundData(1);
        assertEq(round, 1);
        assertEq(answer, 100e8);
        assertEq(started, 100);
        assertEq(updated, 100);
        assertEq(answered, 1);
        assertEq(oracle.decimals(), 8);
    }

    function test_OnlyOwnerCanUpdate() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(123)));
        vm.prank(address(123));
        oracle.setPrice(1);
    }

    function test_InvalidPricesDoNotAdvanceRound() public {
        oracle.setPrice(1);
        vm.expectRevert(MockAggregatorV3.InvalidPrice.selector);
        oracle.setPrice(0);
        vm.expectRevert(MockAggregatorV3.InvalidPrice.selector);
        oracle.setPrice(-1);
        (uint80 round, int256 answer,,,) = oracle.latestRoundData();
        assertEq(round, 1);
        assertEq(answer, 1);
    }

    function testFuzz_PositivePricesPreserved(uint256 price) public {
        price = bound(price, 1, uint256(type(int256).max));
        oracle.setPrice(int256(price));
        (uint80 round, int256 answer,,,) = oracle.latestRoundData();
        assertEq(answer, int256(price));
        assertEq(round, 1);
    }
}
