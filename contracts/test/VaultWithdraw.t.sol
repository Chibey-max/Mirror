// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {LifecyclePolicyDouble} from "./VaultLifecycle.t.sol";

/// @title VaultWithdrawTest
/// @notice PRD Section 7, required test #3 — withdraw. Responsible: Jason. Accountable: Isaac.
///
/// @dev Real vault, token, registry and tape; allocation setup uses a policy double pending PR #15.
contract VaultWithdrawTest is Test {
    CopyVault vault;
    MockUSDG token;
    address user = address(101);

    function setUp() public {
        token = new MockUSDG();
        AgentRegistry registry = new AgentRegistry();
        registry.registerAgent("agent", bytes32(0), "v1");
        TrackRecord record = new TrackRecord(address(registry), address(this));
        LifecyclePolicyDouble policy = new LifecyclePolicyDouble();
        vault = new CopyVault(address(record), address(policy), address(token), address(this));
        policy.configure(address(vault), false, false);
        token.mint(user, 100e6);
        vm.prank(user);
        token.approve(address(vault), 100e6);
        vm.prank(user);
        vault.deposit(100e6);
    }

    /// @dev deposit -> withdraw returns exact principal, balance zeroes, Withdrawn event fires.
    function test_DepositThenWithdrawReturnsExactPrincipal() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit ICopyVault.Withdrawn(user, 100e6);
        vm.prank(user);
        vault.withdraw(100e6);
        assertEq(token.balanceOf(user), 100e6);
        assertEq(vault.balanceOf(user), 0);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    /// @dev Withdrawing more than the free balance must revert InsufficientBalance().
    function test_WithdrawAboveFreeBalanceReverts() public {
        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(user);
        vault.withdraw(100e6 + 1);
        assertEq(vault.balanceOf(user), 100e6);
        assertEq(token.balanceOf(address(vault)), 100e6);
    }

    /// @dev Allocated (followed) funds are not free balance and must not be withdrawable.
    function test_AllocatedFundsAreNotWithdrawable() public {
        vm.prank(user);
        vault.follow(1, 60e6, 0);
        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(user);
        vault.withdraw(40e6 + 1);
        vm.prank(user);
        vault.withdraw(40e6);
        assertEq(vault.allocationOf(user, 1), 60e6);
        vm.prank(user);
        vault.unfollow(1);
        vm.prank(user);
        vault.withdraw(60e6);
        assertEq(token.balanceOf(user), 100e6);
        assertEq(vault.balanceOf(user), 0);
        assertEq(vault.allocationOf(user, 1), 0);
    }
}
