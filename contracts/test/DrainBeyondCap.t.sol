// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @title DrainBeyondCapTest
/// @notice PRD Section 7, required test #4 — drain-beyond-cap. Responsible: Jason.
///         Accountable: Isaac.
///
/// @dev SKELETON. This is the reentrancy/accounting stress test, explicitly NOT a happy path
///      test (PRD Section 7). It is the gate on Day 6's "deposit/withdraw + drain-beyond-cap
///      test green — do not start multi-follower math yet."
contract DrainBeyondCapTest is Test {
    /// @dev An adversarial sequence attempting to withdraw more than free balance must revert
    ///      every time, with no partial state left behind.
    function test_AdversarialWithdrawSequenceAlwaysReverts() public {
        vm.skip(true);
    }

    /// @dev Mirroring against an already-exhausted daily cap must revert every time.
    function test_MirrorBeyondExhaustedCapAlwaysReverts() public {
        vm.skip(true);
    }

    /// @dev A malicious ERC20 that reenters withdraw() must not drain the vault.
    ///      Requires a reentrant-token harness; nonReentrant alone is not evidence.
    function test_ReentrantTokenCannotDrainVault() public {
        vm.skip(true);
    }

    /// @dev Invariant: sum of all users' free + allocated balances always equals the vault's
    ///      actual token balance. Promote to a real invariant test once CopyVault exists.
    function test_VaultAccountingInvariantHolds() public {
        vm.skip(true);
    }
}
