// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {PolicyModule} from "../src/PolicyModule.sol";

/// @title PolicyCapTest
/// @notice PRD Section 7, required test #2 — the daily cap. Responsible: Jason. Accountable: Isaac.
///
/// @dev This is the acceptance test for PRD claim 2: "a follower never gives an agent custody
///      beyond a self-set daily cap, enforced on-chain". It runs the demo's own numbers — Alice
///      follows Pulse with a $60 daily cap, and Pulse buys 0.42 mNVDA at $128.41, which is
///      $53.9322 by the notional formula in v2.2 Section 8.
///
/// @dev REWORDED for v2.2. The skeleton said "a mirrorFill that would exceed the cap must
///      revert". Under Section 7.1 it no longer does: CopyVault catches the revert and logs
///      MirrorRejected, so the mirrorFill transaction succeeds while that follower's copy does
///      not happen. The rejection itself is real and is asserted here, at the contract that makes
///      it. The vault-level half — MirrorRejected carrying these bytes, the follower's position
///      unchanged, other followers unaffected — belongs to CopyVault's suite once mirrorFill
///      lands, and is Jason's per v2.2 Section 12.
contract PolicyCapTest is Test {
    PolicyModule internal policy;

    address internal vault = makeAddr("vault");
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal mNVDA = makeAddr("mNVDA");
    address internal mTSLA = makeAddr("mTSLA");

    uint256 internal constant PULSE = 1;
    uint256 internal constant CAP = 60e6; // $60, raw 6-decimal USDG
    uint256 internal constant FILL = 53_932_200; // 0.42 mNVDA at $128.41, per Section 8

    function setUp() public {
        policy = new PolicyModule(vault, admin);
        vm.prank(admin);
        policy.setTokenAllowlist(mNVDA, true);
        vm.prank(vault);
        policy.setPolicy(alice, PULSE, CAP, 50);
    }

    function _consume(uint256 notional, bool isBuy) internal {
        vm.prank(vault);
        policy.checkAndConsume(alice, PULSE, mNVDA, notional, isBuy);
    }

    /// @dev The headline requirement: a buy that would take the day past the cap is refused, and
    ///      the refusal moves nothing. Both halves matter — a rejection that still consumed cap
    ///      would let a follower be drained by repeated rejected trades.
    function test_ABuyOverTheDailyCapIsRejectedAndMovesNothing() public {
        _consume(FILL, true);
        assertEq(policy.spentToday(alice, PULSE), FILL, "the first fill did not consume its notional");

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, FILL + 10e6, CAP));
        policy.checkAndConsume(alice, PULSE, mNVDA, 10e6, true);

        assertEq(policy.spentToday(alice, PULSE), FILL, "the rejected buy moved the day's spend");
        assertEq(policy.getPolicy(alice, PULSE).maxNotionalPerDay, CAP, "the rejected buy moved the cap");
    }

    /// @dev The cap is a DAILY cap: spend adds up within the day and starts again at 00:00 UTC,
    ///      which is 08:00 SGT — the team's own timezone, and worth stating in the Follow modal.
    function test_TheDailyCapAccumulatesAndResetsAtMidnightUtc() public {
        // 23:59:59 UTC on some day: one second before the reset.
        uint256 lastSecondOfDay = (block.timestamp / 1 days) * 1 days + 1 days - 1;
        vm.warp(lastSecondOfDay);

        _consume(30e6, true);
        _consume(30e6, true);
        assertEq(policy.spentToday(alice, PULSE), CAP, "two buys did not add up to the cap");

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, CAP + 1, CAP));
        policy.checkAndConsume(alice, PULSE, mNVDA, 1, true);

        vm.warp(lastSecondOfDay + 1); // 00:00:00 UTC, the next day
        assertEq(policy.spentToday(alice, PULSE), 0, "the new day did not start empty");

        _consume(CAP, true);
        assertEq(policy.spentToday(alice, PULSE), CAP, "the full cap was not available on the new day");
    }

    /// @dev v2.2 Section 7.5. The cap limits risk added, not risk removed: a follower whose cap is
    ///      used up must still be able to be mirrored out of a position, or the cap traps them
    ///      until the agent happens to trade that token again on a later day.
    function test_ASellIsNeverBlockedByAnExhaustedCap() public {
        _consume(CAP, true);

        _consume(FILL, false);
        assertEq(policy.spentToday(alice, PULSE), CAP, "the sell consumed cap");
    }

    /// @dev Copy-trading only touches tokens the allowlist names, in either direction.
    function test_ATokenOutsideTheAllowlistIsRejected() public {
        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, mTSLA));
        policy.checkAndConsume(alice, PULSE, mTSLA, 1e6, true);

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, mTSLA));
        policy.checkAndConsume(alice, PULSE, mTSLA, 1e6, false);

        assertEq(policy.spentToday(alice, PULSE), 0, "a rejected token still consumed cap");
    }

    /// @dev What KillButton's badge claims — "this agent can no longer move your funds" — proved
    ///      on-chain rather than in the UI. The cap stays readable afterwards, so the page can
    ///      still show what the follow was.
    function test_AKilledFollowRejectsEveryConsume() public {
        _consume(FILL, true);

        vm.prank(vault);
        policy.kill(alice, PULSE);

        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, PULSE, mNVDA, 1, true);

        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, PULSE, mNVDA, 1, false);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, PULSE);
        assertFalse(p.active, "the follow is still active after the kill");
        assertEq(p.maxNotionalPerDay, CAP, "the kill erased the cap the UI still shows");
        assertEq(policy.spentToday(alice, PULSE), FILL, "the kill rewrote the day's spend");
    }

    /// @dev Only CopyVault may set, consume or kill. Anyone reaching PolicyModule directly —
    ///      including the agent, the runner and the owner — is refused.
    function testFuzz_OnlyTheVaultCanConsume(address caller) public {
        vm.assume(caller != vault);

        vm.prank(caller);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.checkAndConsume(alice, PULSE, mNVDA, 1e6, true);

        assertEq(policy.spentToday(alice, PULSE), 0, "a refused caller still consumed cap");
    }
}
