// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {PolicyModule} from "../src/PolicyModule.sol";

/// @title PolicyModuleTest
/// @notice PolicyModule's behaviour, PRD v2.2 §7.5, §7.6 and §7.8. Owner: Isaac.
///
/// @dev Each test is named after the claim it proves, so the list reads as the evidence for
///      "a follower never gives an agent custody beyond the cap they set" (PRD claim 2).
contract PolicyModuleTest is Test {
    PolicyModule internal policy;

    address internal vault = makeAddr("vault");
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal mNVDA = makeAddr("mNVDA");

    uint256 internal constant AGENT = 7;
    uint256 internal constant CAP = 60e6; // 60 USDG, raw 6dp (§8)
    uint256 internal constant SLIPPAGE = 50; // bps, stored and shown, never enforced (§9)

    function setUp() public {
        policy = new PolicyModule(vault, admin);
    }

    function _setPolicy(uint256 cap) internal {
        vm.prank(vault);
        policy.setPolicy(alice, AGENT, cap, SLIPPAGE);
    }

    // --- constructor -------------------------------------------------------

    function test_Constructor_StoresVaultAndOwner() public view {
        assertEq(policy.vault(), vault, "vault not stored");
        assertEq(policy.owner(), admin, "admin not stored as owner");
    }

    function test_Constructor_RejectsZeroVault() public {
        vm.expectRevert(PolicyModule.ZeroVault.selector);
        new PolicyModule(address(0), admin);
    }

    /// @dev The vault address is a PREDICTION: §6 deploys PolicyModule at step 5 and CopyVault at
    ///      step 6, so the address it is given has no code yet and cannot be required to. This is
    ///      deliberately unlike TrackRecord, whose registry must already exist (its D5).
    function test_Constructor_AcceptsAVaultThatHasNoCodeYet() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        assertEq(predicted.code.length, 0, "the predicted vault already has code - test is meaningless");

        PolicyModule fresh = new PolicyModule(predicted, admin);
        assertEq(fresh.vault(), predicted, "a codeless predicted vault was not accepted");
    }

    /// @dev OpenZeppelin's own guard covers a zero admin, so no ZeroAdmin error is needed (D5).
    function test_Constructor_RejectsZeroAdmin() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new PolicyModule(vault, address(0));
    }

    function test_FreshModule_ReadsAsEmptyWithoutReverting() public view {
        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, 0, "unknown policy has a cap");
        assertEq(p.maxSlippageBps, 0, "unknown policy has slippage");
        assertFalse(p.active, "unknown policy is active");
        assertEq(policy.spentToday(alice, AGENT), 0, "unknown policy has spent something");
        assertFalse(policy.isTokenAllowed(mNVDA), "a token is allowlisted before the owner said so");
    }

    // --- setPolicy ---------------------------------------------------------

    function test_SetPolicy_StoresEveryFieldAndActivatesTheFollow() public {
        _setPolicy(CAP);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, CAP, "cap not stored");
        assertEq(p.maxSlippageBps, SLIPPAGE, "slippage not stored");
        assertTrue(p.active, "follow not activated");
    }

    function test_SetPolicy_TouchesOnlyTheGivenFollowerAndAgent() public {
        _setPolicy(CAP);

        assertFalse(policy.getPolicy(alice, AGENT + 1).active, "a different agent was activated");
        assertFalse(policy.getPolicy(address(0xB0B), AGENT).active, "a different follower was activated");
    }

    function test_SetPolicy_EmitsExactlyOnePolicySetWithExactArguments() public {
        vm.recordLogs();
        _setPolicy(CAP);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "expected exactly one event");
        assertEq(logs[0].topics[0], keccak256("PolicySet(address,uint256,uint256,uint256)"), "wrong event");
        assertEq(logs[0].topics[1], bytes32(uint256(uint160(alice))), "user is not indexed as alice");
        assertEq(logs[0].topics[2], bytes32(AGENT), "agentId is not indexed as the agent");
        (uint256 cap, uint256 slippage) = abi.decode(logs[0].data, (uint256, uint256));
        assertEq(cap, CAP, "event cap differs from the stored cap");
        assertEq(slippage, SLIPPAGE, "event slippage differs from the stored slippage");
    }

    function testFuzz_SetPolicy_OnlyTheVaultCanCall(address caller) public {
        vm.assume(caller != vault);

        vm.prank(caller);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.setPolicy(alice, AGENT, CAP, SLIPPAGE);

        assertFalse(policy.getPolicy(alice, AGENT).active, "a rejected call still wrote a policy");
    }

    /// @dev D5: the vault is the only caller and a follower's own numbers are their business, so
    ///      there is no validation here and no error to add to the frozen ABI. A zero cap simply
    ///      rejects every buy; maxSlippageBps is not enforced at all (§9).
    function testFuzz_SetPolicy_AcceptsAnyCapAndAnySlippage(uint256 cap, uint256 slippage) public {
        vm.prank(vault);
        policy.setPolicy(alice, AGENT, cap, slippage);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, cap, "cap not stored verbatim");
        assertEq(p.maxSlippageBps, slippage, "slippage not stored verbatim");
        assertTrue(p.active, "follow not activated");
    }

    /// @dev CopyVault rejects a second follow with AlreadyFollowing, so in practice this only
    ///      happens on a re-follow after unfollow. It must overwrite, not accumulate.
    function test_SetPolicy_OverwritesAnExistingPolicy() public {
        _setPolicy(CAP);

        vm.prank(vault);
        policy.setPolicy(alice, AGENT, 25e6, 999);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, 25e6, "cap not replaced");
        assertEq(p.maxSlippageBps, 999, "slippage not replaced");
        assertTrue(p.active, "follow not active after re-follow");
    }

    function _allow(address token) internal {
        vm.prank(admin);
        policy.setTokenAllowlist(token, true);
    }

    function _buy(uint256 notional) internal {
        vm.prank(vault);
        policy.checkAndConsume(alice, AGENT, mNVDA, notional, true);
    }

    function _sell(uint256 notional) internal {
        vm.prank(vault);
        policy.checkAndConsume(alice, AGENT, mNVDA, notional, false);
    }

    // --- the token allowlist ----------------------------------------------

    function test_SetTokenAllowlist_OwnerCanAddAndRemove() public {
        assertFalse(policy.isTokenAllowed(mNVDA), "allowlisted before anyone said so");

        _allow(mNVDA);
        assertTrue(policy.isTokenAllowed(mNVDA), "owner could not add a token");

        vm.prank(admin);
        policy.setTokenAllowlist(mNVDA, false);
        assertFalse(policy.isTokenAllowed(mNVDA), "owner could not remove a token");
    }

    /// @dev D3: the allowlist is the owner's ONLY power. The vault is not the owner either.
    function testFuzz_SetTokenAllowlist_OnlyTheOwnerCanCall(address caller) public {
        vm.assume(caller != admin);

        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, caller));
        policy.setTokenAllowlist(mNVDA, true);

        assertFalse(policy.isTokenAllowed(mNVDA), "a rejected call still allowlisted the token");
    }

    // --- checkAndConsume: access and gates ---------------------------------

    function testFuzz_CheckAndConsume_OnlyTheVaultCanCall(address caller) public {
        vm.assume(caller != vault);
        _allow(mNVDA);
        _setPolicy(CAP);

        vm.prank(caller);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, true);

        assertEq(policy.spentToday(alice, AGENT), 0, "a rejected call still consumed the cap");
    }

    /// @dev A follow that was never set is inactive, so it allows nothing in either direction.
    function test_CheckAndConsume_AnUnsetFollowRejectsBuysAndSells() public {
        _allow(mNVDA);

        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, true);

        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, false);
    }

    /// @dev §7.5: active is checked first. With both wrong, the follower must be told the follow
    ///      is dead rather than blaming the token — the banner shows exactly this sentence.
    function test_CheckAndConsume_ChecksActiveBeforeTheAllowlist() public {
        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, true);
    }

    function test_CheckAndConsume_RejectsATokenOutsideTheAllowlist() public {
        _setPolicy(CAP);

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, mNVDA));
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, true);

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, mNVDA));
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, false);
    }

    /// @dev The owner can stop mirroring by removing a token mid-day. Documented power (D3),
    ///      and it can never strand principal, because CopyVault returns principal only.
    function test_CheckAndConsume_RemovingATokenStopsFurtherMirrors() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(10e6);

        vm.prank(admin);
        policy.setTokenAllowlist(mNVDA, false);

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, mNVDA));
        policy.checkAndConsume(alice, AGENT, mNVDA, 1e6, true);
        assertEq(policy.spentToday(alice, AGENT), 10e6, "the rejected buy moved the day's spend");
    }

    // --- checkAndConsume: the cap ------------------------------------------

    function test_CheckAndConsume_ABuyExactlyAtTheCapIsAllowed() public {
        _allow(mNVDA);
        _setPolicy(CAP);

        _buy(CAP);
        assertEq(policy.spentToday(alice, AGENT), CAP, "an exact-cap buy did not consume exactly the cap");
    }

    /// @dev §7.6: the check is strict, so one raw unit over is the first rejection (§13 test 5).
    function test_CheckAndConsume_OneUnitOverTheCapIsRejected() public {
        _allow(mNVDA);
        _setPolicy(CAP);

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, CAP + 1, CAP));
        policy.checkAndConsume(alice, AGENT, mNVDA, CAP + 1, true);

        assertEq(policy.spentToday(alice, AGENT), 0, "a rejected buy still consumed the cap");
    }

    /// @dev The PRD's own worked example (§8): 0.42 mNVDA at $128.41 is 53.9322 USDG. It fits a
    ///      $60 cap; a $10 buy after it does not, and `attempted` is the running total (§7.6).
    function test_CheckAndConsume_SpendAccumulatesWithinTheDay() public {
        _allow(mNVDA);
        _setPolicy(CAP);

        _buy(53_932_200);
        assertEq(policy.spentToday(alice, AGENT), 53_932_200, "first buy did not consume its notional");

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, 63_932_200, CAP));
        policy.checkAndConsume(alice, AGENT, mNVDA, 10e6, true);
    }

    /// @dev §7.6: the day is block.timestamp / 1 days — 00:00 UTC, 08:00 SGT.
    function test_CheckAndConsume_TheNextDayStartsFromZero() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(CAP);

        vm.warp(block.timestamp + 1 days);
        assertEq(policy.spentToday(alice, AGENT), 0, "the new day did not start empty");

        _buy(CAP);
        assertEq(policy.spentToday(alice, AGENT), CAP, "the full cap was not available again");
    }

    /// @dev §7.5: the cap limits risk added, not risk removed. A follower whose cap is used up
    ///      must still be able to get out, or the cap traps them in the position.
    function test_CheckAndConsume_SellsNeverConsumeTheCap() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(CAP);

        _sell(type(uint256).max);
        assertEq(policy.spentToday(alice, AGENT), CAP, "a sell moved the day's spend");
    }

    function testFuzz_CheckAndConsume_ARejectedBuyMovesNothing(uint256 over) public {
        over = bound(over, 1, type(uint256).max - CAP);
        _allow(mNVDA);
        _setPolicy(CAP);

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, CAP + over, CAP));
        policy.checkAndConsume(alice, AGENT, mNVDA, CAP + over, true);

        assertEq(policy.spentToday(alice, AGENT), 0, "a rejected buy moved the day's spend");
    }

    /// @dev CopyVault catches this revert and hands the bytes to the banner, so the reason must
    ///      always be a declared error. An unchecked `spent + notional` would surface as
    ///      Panic(0x11) here, which the decoder cannot turn into a sentence.
    function test_CheckAndConsume_AnOverflowingTotalIsCapExceededNotPanic() public {
        _allow(mNVDA);
        _setPolicy(type(uint256).max);
        _buy(type(uint256).max);

        vm.prank(vault);
        vm.expectRevert(
            abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, type(uint256).max, type(uint256).max)
        );
        policy.checkAndConsume(alice, AGENT, mNVDA, 1, true);
    }

    /// @dev PolicyModule logs nothing on a consume: Mirrored and MirrorRejected are CopyVault's,
    ///      and a second source of "this was mirrored" would be a second truth to keep in sync.
    function test_CheckAndConsume_EmitsNothing() public {
        _allow(mNVDA);
        _setPolicy(CAP);

        vm.recordLogs();
        _buy(1e6);
        assertEq(vm.getRecordedLogs().length, 0, "checkAndConsume emitted an event");
    }

    // --- checkAndConsume: D4, spend survives a re-follow --------------------

    function test_CheckAndConsume_SpendSurvivesARefollowOnTheSameDay() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(53_932_200);

        _setPolicy(CAP); // unfollow then follow again, same UTC day
        assertEq(policy.spentToday(alice, AGENT), 53_932_200, "re-following handed back a fresh cap");

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, 63_932_200, CAP));
        policy.checkAndConsume(alice, AGENT, mNVDA, 10e6, true);
    }

    function test_CheckAndConsume_ALowerCapDoesNotForgiveSpend() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(53_932_200);

        _setPolicy(25e6); // re-follow with a cap below what today already spent

        vm.prank(vault);
        vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, 53_932_201, 25e6));
        policy.checkAndConsume(alice, AGENT, mNVDA, 1, true);

        _sell(1e6); // the exit is still open
        assertEq(policy.spentToday(alice, AGENT), 53_932_200, "spend moved when it should not have");
    }

    function testFuzz_CheckAndConsume_SpentTodayIsTheSumOfAcceptedBuys(uint64 a, uint64 b, uint64 c) public {
        _allow(mNVDA);
        _setPolicy(CAP);

        uint256 expected;
        uint64[3] memory buys = [a, b, c];
        for (uint256 i = 0; i < buys.length; i++) {
            uint256 notional = buys[i];
            if (expected + notional > CAP) {
                vm.prank(vault);
                vm.expectRevert(abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, expected + notional, CAP));
                policy.checkAndConsume(alice, AGENT, mNVDA, notional, true);
            } else {
                _buy(notional);
                expected += notional;
            }
            assertEq(policy.spentToday(alice, AGENT), expected, "spend diverged from the accepted buys");
            assertLe(policy.spentToday(alice, AGENT), CAP, "spend passed the cap");
        }
    }

    // --- kill ---------------------------------------------------------------

    function test_Kill_DeactivatesAnActiveFollowAndEmitsExactlyOnce() public {
        _setPolicy(CAP);

        vm.recordLogs();
        vm.prank(vault);
        policy.kill(alice, AGENT);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "expected exactly one event");
        assertEq(logs[0].topics[0], keccak256("PolicyKilled(address,uint256)"), "wrong event");
        assertEq(logs[0].topics[1], bytes32(uint256(uint160(alice))), "user is not indexed as alice");
        assertEq(logs[0].topics[2], bytes32(AGENT), "agentId is not indexed as the agent");

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertFalse(p.active, "follow still active after kill");
        assertEq(p.maxNotionalPerDay, CAP, "kill changed the cap");
        assertEq(p.maxSlippageBps, SLIPPAGE, "kill changed the slippage");
    }

    /// @dev D2. CopyVault.unfollow credits the follower's principal and then calls kill without
    ///      swallowing failures, so a revert here would strand their money. A second kill can only
    ///      happen if the vault's view of "following" and this contract's active flag ever part
    ///      company — and if that happens, the exit must still work.
    function test_Kill_OnAnAlreadyKilledFollowDoesNothing() public {
        _setPolicy(CAP);
        vm.prank(vault);
        policy.kill(alice, AGENT);

        vm.recordLogs();
        vm.prank(vault);
        policy.kill(alice, AGENT);

        assertEq(vm.getRecordedLogs().length, 0, "a second kill logged a second receipt");
        assertFalse(policy.getPolicy(alice, AGENT).active, "the follow came back to life");
    }

    function test_Kill_OnAFollowThatWasNeverSetDoesNothing() public {
        vm.recordLogs();
        vm.prank(vault);
        policy.kill(alice, AGENT);

        assertEq(vm.getRecordedLogs().length, 0, "killing an unknown follow logged a receipt");
        assertFalse(policy.getPolicy(alice, AGENT).active, "an unknown follow became active");
    }

    /// @dev The liveness half of D2: whatever the vault asks, for whoever, kill answers.
    function testFuzz_Kill_NeverRevertsForTheVault(address user, uint256 agentId, bool follows) public {
        if (follows) {
            vm.prank(vault);
            policy.setPolicy(user, agentId, CAP, SLIPPAGE);
        }

        vm.prank(vault);
        policy.kill(user, agentId);
        assertFalse(policy.getPolicy(user, agentId).active, "the follow survived its kill");

        vm.prank(vault);
        policy.kill(user, agentId); // and again, still no revert
    }

    function testFuzz_Kill_OnlyTheVaultCanCall(address caller) public {
        vm.assume(caller != vault);
        _setPolicy(CAP);

        vm.prank(caller);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.kill(alice, AGENT);

        assertTrue(policy.getPolicy(alice, AGENT).active, "a rejected kill still deactivated the follow");
    }

    /// @dev What KillButton's badge claims, proved on-chain: after the kill this agent can move
    ///      nothing of the follower's, in either direction.
    function test_Kill_StopsBuysAndSells() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(10e6);

        vm.prank(vault);
        policy.kill(alice, AGENT);

        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1, true);

        vm.prank(vault);
        vm.expectRevert(IPolicyModule.PolicyInactive.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1, false);

        assertEq(policy.spentToday(alice, AGENT), 10e6, "kill rewrote the day's spend");
    }

    // --- what the owner cannot do (D3) -------------------------------------

    /// @dev The "no admin backdoors" criterion, as a test. The owner holds the allowlist and
    ///      nothing else: every policy write is the vault's, owner included.
    function test_Owner_CannotSetConsumeOrKill() public {
        _allow(mNVDA);
        _setPolicy(CAP);

        vm.prank(admin);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.setPolicy(alice, AGENT, 1_000_000e6, SLIPPAGE);

        vm.prank(admin);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.checkAndConsume(alice, AGENT, mNVDA, 1, true);

        vm.prank(admin);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.kill(alice, AGENT);
    }

    function test_Owner_CannotMoveACapOrTodaysSpend() public {
        _allow(mNVDA);
        _setPolicy(CAP);
        _buy(10e6);

        vm.startPrank(admin);
        policy.setTokenAllowlist(mNVDA, false);
        policy.setTokenAllowlist(mNVDA, true);
        policy.transferOwnership(address(0xDAD));
        vm.stopPrank();

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, CAP, "an owner action moved the cap");
        assertTrue(p.active, "an owner action changed the active flag");
        assertEq(policy.spentToday(alice, AGENT), 10e6, "an owner action moved the day's spend");
    }

    function test_RenouncedOwner_KeepsTheAllowlistButCanNoLongerChangeIt() public {
        _allow(mNVDA);

        vm.prank(admin);
        policy.renounceOwnership();

        assertTrue(policy.isTokenAllowed(mNVDA), "renouncing emptied the allowlist");
        assertEq(policy.owner(), address(0), "ownership was not renounced");

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, admin));
        policy.setTokenAllowlist(mNVDA, false);
    }
}
