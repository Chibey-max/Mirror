// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// Code-bearing placeholders: custody does not call the policy or track record.
contract CustodyDependency {}

contract CallbackUSDG is MockUSDG {
    CopyVault public target;
    bool public attack;
    bool public failTransfers;
    bool public callbackSucceeded;
    bytes public callbackResult;

    function configure(CopyVault vault, bool attack_, bool fail_) external {
        target = vault;
        attack = attack_;
        failTransfers = fail_;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(target) && failTransfers) revert("transfer failed");
        super._update(from, to, value);
        if (attack && (from == address(target) || to == address(target))) {
            attack = false;
            (callbackSucceeded, callbackResult) = address(target).call(abi.encodeCall(target.withdraw, (1)));
        }
    }
}

contract VaultFoundationTest is Test {
    CopyVault vault;
    CallbackUSDG token;
    CustodyDependency dependency;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        token = new CallbackUSDG();
        dependency = new CustodyDependency();
        vault = new CopyVault(address(dependency), address(dependency), address(token), address(this));
        token.configure(vault, false, false);
        token.mint(alice, 1000e6);
        token.mint(bob, 1000e6);
        vm.prank(alice);
        token.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        token.approve(address(vault), type(uint256).max);
    }

    function test_DepositWithdrawEventsAndExactPrincipal() public {
        vm.expectEmit(true, false, false, true, address(vault));
        emit ICopyVault.Deposited(alice, 100e6);
        vm.prank(alice);
        vault.deposit(100e6);
        assertEq(vault.balanceOf(alice), 100e6);
        vm.expectEmit(true, false, false, true, address(vault));
        emit ICopyVault.Withdrawn(alice, 100e6);
        vm.prank(alice);
        vault.withdraw(100e6);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(token.balanceOf(alice), 1000e6);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_UsersCannotWithdrawEachOthersFundsOrDonations() public {
        vm.prank(alice);
        vault.deposit(100e6);
        token.mint(address(vault), 20e6);
        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(bob);
        vault.withdraw(1);
        vm.prank(alice);
        vault.withdraw(100e6);
        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(alice);
        vault.withdraw(1);
        assertEq(token.balanceOf(address(vault)), 20e6);
    }

    function test_FailedDepositCreatesNoCredit() public {
        vm.expectRevert();
        vm.prank(alice);
        vault.deposit(1001e6);
        assertEq(vault.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(vault)), 0);
    }

    function test_FailedWithdrawalRestoresCredit() public {
        vm.prank(alice);
        vault.deposit(100e6);
        token.configure(vault, false, true);
        vm.expectRevert(bytes("transfer failed"));
        vm.prank(alice);
        vault.withdraw(100e6);
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(token.balanceOf(address(vault)), 100e6);
    }

    function _seedCallbackCredit() internal {
        token.mint(address(token), 10);
        vm.prank(address(token));
        token.approve(address(vault), 10);
        vm.prank(address(token));
        vault.deposit(10);
    }

    function _assertBlockedCallback() internal view {
        assertFalse(token.callbackSucceeded());
        assertEq(token.callbackResult(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector));
        assertEq(vault.balanceOf(address(token)), 10);
    }

    function test_DepositBlocksReentrantWithdrawalWithValidCredit() public {
        _seedCallbackCredit();
        token.configure(vault, true, false);
        vm.prank(alice);
        vault.deposit(100e6);
        _assertBlockedCallback();
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(token.balanceOf(address(vault)), 100e6 + 10);
    }

    function test_WithdrawalBlocksReentrantWithdrawalWithValidCredit() public {
        _seedCallbackCredit();
        vm.prank(alice);
        vault.deposit(100e6);
        token.configure(vault, true, false);
        vm.prank(alice);
        vault.withdraw(100e6);
        _assertBlockedCallback();
        assertEq(vault.balanceOf(alice), 0);
        assertEq(token.balanceOf(address(vault)), 10);
    }

    function testFuzz_MultiUserAccounting(uint96 a, uint96 b, uint96 withdrawal, uint96 donation) public {
        token.mint(alice, a);
        token.mint(bob, b);
        vm.prank(alice);
        vault.deposit(a);
        vm.prank(bob);
        vault.deposit(b);
        uint256 w = bound(withdrawal, 0, a);
        vm.prank(alice);
        vault.withdraw(w);
        token.mint(address(vault), donation);
        assertEq(vault.balanceOf(alice), uint256(a) - w);
        assertEq(vault.balanceOf(bob), b);
        assertEq(token.balanceOf(address(vault)), vault.balanceOf(alice) + vault.balanceOf(bob) + donation);
    }

    function test_ConstructorRejectsZeroRunner() public {
        vm.expectRevert(ICopyVault.ZeroRunner.selector);
        new CopyVault(address(dependency), address(dependency), address(token), address(0));
    }

    function test_ConstructorRejectsCodelessDependencies() public {
        vm.expectRevert(bytes("CopyVault: invalid TrackRecord"));
        new CopyVault(alice, address(dependency), address(token), bob);
        vm.expectRevert(bytes("CopyVault: invalid PolicyModule"));
        new CopyVault(address(dependency), alice, address(token), bob);
        vm.expectRevert(bytes("CopyVault: invalid USDG"));
        new CopyVault(address(dependency), address(dependency), alice, bob);
    }

    function test_UnimplementedTradingFailsClosed() public {
        vm.expectRevert(CopyVault.NotImplemented.selector);
        vault.follow(1, 1, 1);
        vm.expectRevert(CopyVault.NotImplemented.selector);
        vault.unfollow(1);
        vm.expectRevert(CopyVault.NotImplemented.selector);
        vault.mirrorFill(1);
    }
}
