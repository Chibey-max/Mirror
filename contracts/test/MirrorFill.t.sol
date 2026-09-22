// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStock} from "../src/mocks/MockStock.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract NoDecimalsToken {}

contract MalformedDecimalsToken {
    fallback() external {
        assembly {
            mstore(0, 0x100)
            return(0, 0x20)
        }
    }
}

contract MirrorVaultHarness is CopyVault {
    constructor(address record, address policy, address token, address runner_)
        CopyVault(record, policy, token, runner_)
    {}

    function seedPosition(address user, uint256 agentId, address token, uint256 size) external {
        _position[user][agentId][_positionEpoch[user][agentId]][token] = size;
    }
}

contract MirrorFillTest is Test {
    uint256 internal constant AGENT = 1;
    uint256 internal constant ONE_STOCK = 1e18;
    uint256 internal constant ONE_DOLLAR = 1e8;

    AgentRegistry internal registry;
    TrackRecord internal record;
    PolicyModule internal policy;
    MirrorVaultHarness internal vault;
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

        // PolicyModule is deployed first and therefore receives CopyVault's next CREATE address.
        address predictedVault = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        policy = new PolicyModule(predictedVault, address(this));
        vault = new MirrorVaultHarness(address(record), address(policy), address(usdg), address(this));
        assertEq(address(vault), predictedVault, "policy did not receive the vault's predicted address");
        policy.setTokenAllowlist(address(stock), true);
    }

    function _follow(address user, uint256 cap) internal {
        usdg.mint(user, cap);
        vm.startPrank(user);
        usdg.approve(address(vault), cap);
        vault.deposit(cap);
        vault.follow(AGENT, cap, 50);
        vm.stopPrank();
    }

    function _record(bool isBuy, uint256 size, uint256 price) internal returns (uint256) {
        return record.recordFill(AGENT, address(stock), isBuy, size, price, bytes32("round"));
    }

    function _recordToken(address token, bool isBuy, uint256 size, uint256 price) internal returns (uint256) {
        return record.recordFill(AGENT, token, isBuy, size, price, bytes32("round"));
    }

    function test_OnlyRunnerCanMirrorAndUnknownFillsRevert() public {
        vm.prank(alice);
        vm.expectRevert(ICopyVault.NotRunner.selector);
        vault.mirrorFill(1);

        vm.expectRevert(abi.encodeWithSelector(ICopyVault.FillNotFound.selector, 1));
        vault.mirrorFill(1);
    }

    function test_MarksNoEligibleFillProcessedAndPreventsReplay() public {
        uint256 beforeFollow = _record(true, ONE_STOCK, ONE_DOLLAR);
        _follow(alice, 10e6);

        vault.mirrorFill(beforeFollow);
        assertTrue(vault.isMirrored(beforeFollow), "ineligible fill was not processed");
        assertEq(vault.positionOf(alice, AGENT, address(stock)), 0, "pre-follow fill moved a position");
        assertEq(vault.followFillBoundaryOf(alice, AGENT), beforeFollow, "boundary was not exposed");

        vm.expectRevert(abi.encodeWithSelector(ICopyVault.FillAlreadyMirrored.selector, beforeFollow));
        vault.mirrorFill(beforeFollow);
    }

    function test_BuyUsesCeilingNotionalAndUpdatesTheCurrentEpochPosition() public {
        _follow(alice, 60e6);
        uint256 size = 420_000_000_000_000_000;
        uint256 fillId = _record(true, size, 12_841_000_000);

        vm.expectEmit(true, true, true, true, address(vault));
        emit ICopyVault.Mirrored(alice, AGENT, fillId, size, true);
        vault.mirrorFill(fillId);

        assertTrue(vault.isMirrored(fillId), "successful fill was not marked");
        assertEq(vault.positionOf(alice, AGENT, address(stock)), size, "buy did not increase position");
        assertEq(policy.spentToday(alice, AGENT), 53_932_200, "buy did not consume the ceil notional");

        uint256 dustFill = _record(true, 1, 1);
        vault.mirrorFill(dustFill);
        assertEq(policy.spentToday(alice, AGENT), 53_932_201, "dust buy did not round up to one raw USDG");
    }

    function test_PolicyRejectionIsolatedAndOtherFollowerStillMirrors() public {
        _follow(alice, 60e6);
        _follow(bob, 100e6);
        uint256 fillId = _record(true, ONE_STOCK, 80 * ONE_DOLLAR);
        bytes memory reason = abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, 80e6, 60e6);

        vm.expectEmit(true, true, true, true, address(vault));
        emit ICopyVault.MirrorRejected(alice, AGENT, fillId, reason);
        vm.expectEmit(true, true, true, true, address(vault));
        emit ICopyVault.Mirrored(bob, AGENT, fillId, ONE_STOCK, true);
        vault.mirrorFill(fillId);

        assertEq(vault.positionOf(alice, AGENT, address(stock)), 0, "rejected follower moved position");
        assertEq(vault.positionOf(bob, AGENT, address(stock)), ONE_STOCK, "accepted follower did not mirror");
        assertEq(policy.spentToday(alice, AGENT), 0, "rejected follower spent cap");
        assertEq(policy.spentToday(bob, AGENT), 80e6, "accepted follower did not spend cap");
    }

    function test_SellClampsToHeldSizeAndNeverConsumesAdditionalCap() public {
        _follow(alice, 50e6);
        uint256 buyId = _record(true, 2 * ONE_STOCK, 20 * ONE_DOLLAR);
        vault.mirrorFill(buyId);
        assertEq(policy.spentToday(alice, AGENT), 40e6, "buy spend missing");

        uint256 sellId = _record(false, 3 * ONE_STOCK, 200 * ONE_DOLLAR);
        vault.mirrorFill(sellId);
        assertEq(vault.positionOf(alice, AGENT, address(stock)), 0, "sell was not clamped to held size");
        assertEq(policy.spentToday(alice, AGENT), 40e6, "sell consumed cap");
    }

    function test_ZeroHeldSellIsProcessedWithoutMirrorOrRejection() public {
        _follow(alice, 10e6);
        uint256 fillId = _record(false, ONE_STOCK, ONE_DOLLAR);

        vm.recordLogs();
        vault.mirrorFill(fillId);
        assertEq(vm.getRecordedLogs().length, 0, "zero-held sell emitted a mirror result");
        assertTrue(vault.isMirrored(fillId), "zero-held sell was not processed");
    }

    function test_PositionOverflowRejectsOnlyThatFollower() public {
        _follow(alice, 10e6);
        vault.seedPosition(alice, AGENT, address(stock), type(uint256).max);
        uint256 fillId = _record(true, 1, ONE_DOLLAR);

        vm.expectEmit(true, true, true, true, address(vault));
        emit ICopyVault.MirrorRejected(
            alice, AGENT, fillId, abi.encodeWithSelector(ICopyVault.PositionOverflow.selector)
        );
        vault.mirrorFill(fillId);

        assertEq(vault.positionOf(alice, AGENT, address(stock)), type(uint256).max, "overflow changed position");
        assertEq(policy.spentToday(alice, AGENT), 0, "overflow follower consumed cap");
        assertTrue(vault.isMirrored(fillId), "overflow fill was not processed");
    }

    function test_NotionalOverflowRevertsBeforeProcessing() public {
        uint256 fillId = _record(true, type(uint256).max, type(uint256).max);

        vm.expectRevert(abi.encodeWithSelector(ICopyVault.NotionalOverflow.selector, fillId));
        vault.mirrorFill(fillId);
        assertFalse(vault.isMirrored(fillId), "malformed fill was marked processed");
    }

    function test_SixDecimalTokenRevertsBeforeProcessing() public {
        uint256 fillId = _recordToken(address(usdg), true, ONE_STOCK, ONE_DOLLAR);

        vm.expectRevert(abi.encodeWithSelector(ICopyVault.InvalidTokenDecimals.selector, address(usdg)));
        vault.mirrorFill(fillId);
        assertFalse(vault.isMirrored(fillId), "unsupported token was marked processed");
    }

    function test_MissingDecimalsRevertsWithNamedError() public {
        address token = address(new NoDecimalsToken());
        uint256 fillId = _recordToken(token, false, ONE_STOCK, ONE_DOLLAR);

        vm.expectRevert(abi.encodeWithSelector(ICopyVault.InvalidTokenDecimals.selector, token));
        vault.mirrorFill(fillId);
        assertFalse(vault.isMirrored(fillId), "metadata-less token was marked processed");
    }

    function test_MalformedDecimalsRevertsWithNamedError() public {
        address token = address(new MalformedDecimalsToken());
        uint256 fillId = _recordToken(token, true, ONE_STOCK, ONE_DOLLAR);

        vm.expectRevert(abi.encodeWithSelector(ICopyVault.InvalidTokenDecimals.selector, token));
        vault.mirrorFill(fillId);
        assertFalse(vault.isMirrored(fillId), "malformed token was marked processed");
    }

    function test_CeilIncrementOverflowRevertsBeforeProcessing() public {
        uint256 denominator = 1e20;
        uint256 price = denominator + 1;
        uint256 size = type(uint256).max - (type(uint256).max / price);
        uint256 fillId = _record(true, size, price);

        assertEq(Math.mulDiv(size, price, denominator), type(uint256).max, "floor quotient did not reach max");
        assertGt(mulmod(size, price, denominator), 0, "constructed product divided exactly");
        vm.expectRevert(abi.encodeWithSelector(ICopyVault.NotionalOverflow.selector, fillId));
        vault.mirrorFill(fillId);
        assertFalse(vault.isMirrored(fillId), "ceil-overflow fill was marked processed");
    }
}
