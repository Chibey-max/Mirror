// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";

/// @title PolicyCapTest
/// @notice PRD Section 7, required test #2 — over-cap revert. Accountable: Isaac.
///
/// @dev SKELETON. These skip rather than pass: PolicyModule's bodies land Day 5 (Mon 15 Sep),
///      and a test that asserts nothing but reports green is worse than no test at all.
///      Remove the vm.skip line as each body is implemented.
contract PolicyCapTest is Test {
    /// @dev A mirrorFill that would exceed maxNotionalPerDay must revert with
    ///      CapExceeded(attempted, cap) AND leave the follower's allocation unchanged.
    ///      Assert both halves — a revert that still moved state is the bug this test exists for.
    function test_OverCapReverts() public {
        vm.skip(true);
        // TODO(Day 5): setPolicy(user, agentId, cap = 100e6, slippage);
        // vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, 150e6, 100e6));
        // then assert allocationOf(user, agentId) is byte-identical to its pre-call value.
    }

    /// @dev Spend must accumulate within a day and reset on the next day boundary.
    function test_DailyCapAccumulatesAndResets() public {
        vm.skip(true);
        // TODO(Day 5): consume 60e6, then 60e6 -> second call reverts CapExceeded.
        // vm.warp past the day boundary -> 60e6 succeeds again.
    }

    /// @dev A token outside the allowlist must revert TokenNotAllowed(token).
    function test_NonAllowlistedTokenReverts() public {
        vm.skip(true);
    }

    /// @dev After kill(), any further consume must revert PolicyInactive().
    ///      This is what KillButton's "this agent can no longer move your funds" badge claims;
    ///      the claim has to be true on-chain, not just in the UI (PRD Section 5.3).
    function test_KilledPolicyRejectsConsume() public {
        vm.skip(true);
    }

    /// @dev Only the vault may call setPolicy / checkAndConsume / kill.
    function test_NonVaultCallerReverts() public {
        vm.skip(true);
        // TODO(Day 5): vm.expectRevert(IPolicyModule.OnlyVault.selector) from a random caller.
    }
}
