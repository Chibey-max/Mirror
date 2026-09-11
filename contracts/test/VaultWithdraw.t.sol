// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @title VaultWithdrawTest
/// @notice PRD Section 7, required test #3 — withdraw. Responsible: Jason. Accountable: Isaac.
///
/// @dev SKELETON. CopyVault is Jason's deliverable (PRD Section 4.4) and does not exist yet.
///      These are scaffolded here so the Section 7 requirement is encoded in the repo rather
///      than remembered. They skip, so they cannot report a false green.
contract VaultWithdrawTest is Test {
    /// @dev deposit -> withdraw returns exact principal, balance zeroes, Withdrawn event fires.
    function test_DepositThenWithdrawReturnsExactPrincipal() public {
        vm.skip(true);
    }

    /// @dev Withdrawing more than the free balance must revert InsufficientBalance().
    function test_WithdrawAboveFreeBalanceReverts() public {
        vm.skip(true);
    }

    /// @dev Allocated (followed) funds are not free balance and must not be withdrawable.
    function test_AllocatedFundsAreNotWithdrawable() public {
        vm.skip(true);
    }
}
