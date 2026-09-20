// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Test double only. Production PolicyModule is still a stub on this branch.
contract LifecyclePolicyDouble {
    address public vault;
    bool public failSet;
    bool public failKill;
    bool public probe;
    bytes public callbackFailure;
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public spent;
    mapping(address => mapping(uint256 => IPolicyModule.Policy)) internal policies;

    function configure(address vault_, bool set_, bool kill_) external {
        vault = vault_;
        failSet = set_;
        failKill = kill_;
    }

    function setPolicy(address user, uint256 agent, uint256 cap, uint256 slippage) external {
        require(msg.sender == vault, "only vault");
        require(!failSet, "set failed");
        policies[user][agent] = IPolicyModule.Policy(cap, slippage, true);
        _probe();
    }

    function kill(address user, uint256 agent) external {
        require(msg.sender == vault, "only vault");
        require(!failKill, "kill failed");
        policies[user][agent].active = false;
        _probe();
    }

    function seedSpent(address user, uint256 agent, uint256 amount) external {
        spent[user][agent][block.timestamp / 1 days] = amount;
    }

    function enableProbe() external {
        probe = true;
    }

    function _probe() internal {
        if (probe) {
            (bool ok, bytes memory reason) = vault.call(abi.encodeCall(CopyVault.withdraw, (0)));
            require(!ok, "callback unexpectedly succeeded");
            callbackFailure = reason;
        }
    }

    function getPolicy(address user, uint256 agent) external view returns (IPolicyModule.Policy memory) {
        return policies[user][agent];
    }
}

contract LifecycleVaultHarness is CopyVault {
    constructor(address policy, address token) CopyVault(policy, policy, token, msg.sender) {}

    // Test-only injection of virtual holdings; production vault has no such setter.
    function seedPosition(address user, uint256 agent, address token, uint256 size) external {
        _position[user][agent][_positionEpoch[user][agent]][token] = size;
    }
}

contract VaultLifecycleTest is Test {
    MockUSDG token;
    CopyVault vault;
    LifecyclePolicyDouble policy;
    address alice = address(101);
    address bob = address(102);
    address carol = address(103);

    function setUp() public {
        token = new MockUSDG();
        policy = new LifecyclePolicyDouble();
        vault = new LifecycleVaultHarness(address(policy), address(token));
        policy.configure(address(vault), false, false);
        address[3] memory users = [alice, bob, carol];
        for (uint256 i; i < users.length; i++) {
            token.mint(users[i], 100e6);
            vm.startPrank(users[i]);
            token.approve(address(vault), 100e6);
            vault.deposit(100e6);
            vm.stopPrank();
        }
    }

    function test_FollowReservesPrincipalAndSetsPolicy() public {
        vm.expectEmit(true, true, false, true, address(vault));
        emit ICopyVault.Followed(alice, 7, 60e6);
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        assertEq(vault.balanceOf(alice), 40e6);
        assertEq(vault.allocationOf(alice, 7), 60e6);
        assertEq(vault.followerCountOf(7), 1);
        assertEq(vault.followersOf(7)[0], alice);
        IPolicyModule.Policy memory p = policy.getPolicy(alice, 7);
        assertEq(p.maxNotionalPerDay, 60e6);
        assertEq(p.maxSlippageBps, 100);
        assertTrue(p.active);
        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(alice);
        vault.withdraw(40e6 + 1);
    }

    function test_UnfollowReturnsOnlyPrincipalAndAllowsFullWithdrawal() public {
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        vm.expectEmit(true, true, false, true, address(vault));
        emit ICopyVault.Unfollowed(alice, 7, 60e6);
        vm.prank(alice);
        vault.unfollow(7);
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.allocationOf(alice, 7), 0);
        assertEq(vault.followerCountOf(7), 0);
        assertFalse(policy.getPolicy(alice, 7).active);
        vm.prank(alice);
        vault.withdraw(100e6);
        assertEq(token.balanceOf(alice), 100e6);
    }

    function test_DuplicateAndMissingFollowRevert() public {
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        vm.expectRevert(ICopyVault.AlreadyFollowing.selector);
        vm.prank(alice);
        vault.follow(7, 1, 0);
        vm.expectRevert(ICopyVault.NotFollowing.selector);
        vm.prank(bob);
        vault.unfollow(7);
        vm.prank(alice);
        vault.unfollow(7);
        vm.expectRevert(ICopyVault.NotFollowing.selector);
        vm.prank(alice);
        vault.unfollow(7);
    }

    function test_PolicyCallbacksCannotReenterFollowOrUnfollow() public {
        policy.enableProbe();
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        assertEq(
            policy.callbackFailure(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        vm.prank(alice);
        vault.unfollow(7);
        assertEq(
            policy.callbackFailure(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(vault.balanceOf(alice), 100e6);
    }

    function test_RefollowWithSpendPreservingPolicyDoubleKeepsDailySpend() public {
        vm.warp(2 days);
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        policy.seedSpent(alice, 7, 40e6);
        vm.prank(alice);
        vault.unfollow(7);
        vm.prank(alice);
        vault.follow(7, 30e6, 100);
        assertEq(policy.spent(alice, 7, 2), 40e6);
        assertEq(policy.getPolicy(alice, 7).maxNotionalPerDay, 30e6);
        // A lower new cap must not erase spend: the real module must reject subsequent buys.
        // This double checks the integration contract, NOT the still-unimplemented real policy.
    }

    function test_UnfollowClearsPositionsWithoutAffectingOthersAndRefollowStartsEmpty() public {
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        vm.prank(bob);
        vault.follow(7, 60e6, 100);
        LifecycleVaultHarness h = LifecycleVaultHarness(address(vault));
        h.seedPosition(alice, 7, address(501), 11);
        h.seedPosition(alice, 7, address(502), 22);
        h.seedPosition(bob, 7, address(501), 33);
        vm.prank(alice);
        vault.unfollow(7);
        assertEq(vault.positionOf(alice, 7, address(501)), 0);
        assertEq(vault.positionOf(alice, 7, address(502)), 0);
        assertEq(vault.positionOf(bob, 7, address(501)), 33);
        vm.prank(alice);
        vault.follow(7, 40e6, 100);
        assertEq(vault.positionOf(alice, 7, address(501)), 0);
        assertEq(vault.allocationOf(alice, 7), 40e6);
    }

    function test_InsufficientFundsAndZeroCapMembership() public {
        vm.expectRevert(ICopyVault.InsufficientBalance.selector);
        vm.prank(alice);
        vault.follow(7, 100e6 + 1, 0);
        // No ZeroCap error is specified: membership must not rely on principal being nonzero.
        vm.prank(alice);
        vault.follow(7, 0, 0);
        vm.expectRevert(ICopyVault.AlreadyFollowing.selector);
        vm.prank(alice);
        vault.follow(7, 0, 0);
        assertEq(vault.followerCountOf(7), 1);
        vm.prank(alice);
        vault.unfollow(7);
        assertEq(vault.followerCountOf(7), 0);
    }

    function test_SwapRemovalKeepsMovedFollowerRemovable() public {
        vm.prank(alice);
        vault.follow(7, 10, 0);
        vm.prank(bob);
        vault.follow(7, 20, 0);
        vm.prank(carol);
        vault.follow(7, 30, 0);
        vm.prank(bob);
        vault.unfollow(7);
        assertEq(vault.followersOf(7).length, 2);
        vm.prank(carol);
        vault.unfollow(7);
        assertEq(vault.followersOf(7)[0], alice);
        vm.prank(alice);
        vault.unfollow(7);
        assertEq(vault.followerCountOf(7), 0);
    }

    function test_PolicyFailuresRollBackMembershipAndPrincipal() public {
        policy.configure(address(vault), true, false);
        vm.expectRevert(bytes("set failed"));
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        assertEq(vault.balanceOf(alice), 100e6);
        assertEq(vault.followerCountOf(7), 0);
        policy.configure(address(vault), false, true);
        vm.prank(alice);
        vault.follow(7, 60e6, 100);
        vm.expectRevert(bytes("kill failed"));
        vm.prank(alice);
        vault.unfollow(7);
        assertEq(vault.balanceOf(alice), 40e6);
        assertEq(vault.allocationOf(alice, 7), 60e6);
        assertEq(vault.followersOf(7)[0], alice);
        policy.configure(address(vault), false, false);
        vm.prank(alice);
        vault.unfollow(7);
    }

    function test_ActualPolicyStubRemainsAnIntegrationBlocker() public {
        PolicyModule stub =
            new PolicyModule(vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1), address(this));
        CopyVault target = new CopyVault(address(policy), address(stub), address(token), address(this));
        assertEq(stub.vault(), address(target));
        vm.expectRevert(PolicyModule.NotImplemented.selector);
        target.follow(7, 0, 0);
        assertEq(target.followerCountOf(7), 0);
    }

    function testFuzz_LifecycleSequencePreservesPrincipal(uint256 seed) public {
        uint256[3] memory free = [uint256(100e6), 100e6, 100e6];
        uint256[2][3] memory principal;
        bool[2][3] memory active;
        address[3] memory users = [alice, bob, carol];
        for (uint256 step; step < 48; step++) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 u = seed % 3;
            uint256 a = (seed >> 8) % 2;
            if (active[u][a]) {
                vm.prank(users[u]);
                vault.unfollow(a);
                free[u] += principal[u][a];
                principal[u][a] = 0;
                active[u][a] = false;
            } else {
                uint256 amount = (seed >> 16) % (free[u] + 1);
                vm.prank(users[u]);
                vault.follow(a, amount, 100);
                free[u] -= amount;
                principal[u][a] = amount;
                active[u][a] = true;
            }
            uint256 liabilities;
            for (uint256 i; i < 3; i++) {
                assertEq(vault.balanceOf(users[i]), free[i]);
                liabilities += free[i];
                for (uint256 j; j < 2; j++) {
                    assertEq(vault.allocationOf(users[i], j), principal[i][j]);
                    liabilities += principal[i][j];
                }
            }
            assertEq(token.balanceOf(address(vault)), liabilities);
        }
        for (uint256 i; i < 3; i++) {
            for (uint256 j; j < 2; j++) {
                if (active[i][j]) {
                    vm.prank(users[i]);
                    vault.unfollow(j);
                }
            }
            vm.prank(users[i]);
            vault.withdraw(100e6);
            assertEq(token.balanceOf(users[i]), 100e6);
        }
    }
}
