// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStock} from "../src/mocks/MockStock.sol";

/// @title DrainBeyondCapTest
/// @notice PRD §13: CopyVault's cap, exit, and solvency properties with real PolicyModule integration.
contract DrainBeyondCapTest is Test {
    uint256 internal constant AGENT = 1;
    uint256 internal constant STOCK_UNIT = 1e18;
    uint256 internal constant DOLLAR = 1e8;

    AgentRegistry internal registry;
    TrackRecord internal record;
    PolicyModule internal policy;
    CopyVault internal vault;
    MockUSDG internal usdg;
    MockStock internal stock;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        registry = new AgentRegistry();
        registry.registerAgent("Pulse", bytes32("pulse"), "v1");
        record = new TrackRecord(address(registry), address(this));
        usdg = new MockUSDG();
        stock = new MockStock("Mock NVDA", "mNVDA");

        address predictedVault = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        policy = new PolicyModule(predictedVault, address(this));
        vault = new CopyVault(address(record), address(policy), address(usdg), address(this));
        policy.setTokenAllowlist(address(stock), true);
    }

    function _fundAndFollow(address user, uint256 cap) internal {
        usdg.mint(user, cap);
        vm.startPrank(user);
        usdg.approve(address(vault), cap);
        vault.deposit(cap);
        vault.follow(AGENT, cap, 50);
        vm.stopPrank();
    }

    function _fill(bool isBuy, uint256 size, uint256 price) internal returns (uint256) {
        return record.recordFill(AGENT, address(stock), isBuy, size, price, bytes32("round"));
    }

    /// @dev A rejected follower is not a reverted mirror transaction, and cannot block someone
    ///      else from receiving the same fill.
    function test_MirrorBeyondExhaustedCapEmitsRejectionAndContinues() public {
        _fundAndFollow(alice, 60e6);
        _fundAndFollow(bob, 100e6);

        vault.mirrorFill(_fill(true, 60 * STOCK_UNIT, ONE_DOLLAR_PRICE()));
        uint256 nextFill = _fill(true, STOCK_UNIT, ONE_DOLLAR_PRICE());

        vm.expectEmit(true, true, true, true, address(vault));
        emit ICopyVault.MirrorRejected(
            alice, AGENT, nextFill, abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, 61e6, 60e6)
        );
        vault.mirrorFill(nextFill);

        assertEq(vault.positionOf(alice, AGENT, address(stock)), 60 * STOCK_UNIT, "cap bypassed");
        assertEq(vault.positionOf(bob, AGENT, address(stock)), 61 * STOCK_UNIT, "other follower was blocked");
    }

    /// @dev No position update grants withdrawable value; only unfollow releases the original principal.
    function test_AdversarialWithdrawSequenceCannotDrainPrincipal() public {
        _fundAndFollow(alice, 60e6);
        vault.mirrorFill(_fill(true, 60 * STOCK_UNIT, ONE_DOLLAR_PRICE()));

        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(alice);
        vault.withdraw(1);

        vm.prank(alice);
        vault.unfollow(AGENT);
        vm.prank(alice);
        vault.withdraw(60e6);
        assertEq(usdg.balanceOf(alice), 60e6, "withdrawal exceeded principal");
    }

    /// @dev A buy at the cap can be followed by a sell on the same day: exits never consume cap.
    function test_BuyAtCapThenSellStillMirrors() public {
        _fundAndFollow(alice, 60e6);
        vault.mirrorFill(_fill(true, 60 * STOCK_UNIT, ONE_DOLLAR_PRICE()));
        vault.mirrorFill(_fill(false, 60 * STOCK_UNIT, 2 * DOLLAR));

        assertEq(vault.positionOf(alice, AGENT, address(stock)), 0, "sell was blocked by exhausted cap");
        assertEq(policy.spentToday(alice, AGENT), 60e6, "sell changed daily spend");
    }

    /// @dev The settlement token balance always covers free balances plus principal, regardless of
    ///      virtual fills. This is the Option-A solvency invariant in a fuzzed two-follower sequence.
    function testFuzz_VaultAccountingInvariantHolds(uint64 aliceCap, uint64 bobCap, uint64 size) public {
        aliceCap = uint64(bound(aliceCap, 1e6, 100e6));
        bobCap = uint64(bound(bobCap, 1e6, 100e6));
        size = uint64(bound(size, 1, 1e18));
        _fundAndFollow(alice, aliceCap);
        _fundAndFollow(bob, bobCap);

        uint256 price = 1;
        vault.mirrorFill(_fill(true, size, price));

        uint256 credited = vault.balanceOf(alice) + vault.balanceOf(bob) + vault.allocationOf(alice, AGENT)
            + vault.allocationOf(bob, AGENT);
        assertGe(usdg.balanceOf(address(vault)), credited, "virtual positions created an insolvency");
    }

    function ONE_DOLLAR_PRICE() internal pure returns (uint256) {
        return DOLLAR;
    }
}
