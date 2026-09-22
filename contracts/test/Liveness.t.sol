// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {console} from "forge-std/console.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStock} from "../src/mocks/MockStock.sol";

/// @title LivenessTest
/// @notice The one claim the pitch makes that nothing else proves end to end: **whatever the agent,
///         the runner, or PolicyModule's owner does, a follower can always leave with their principal.**
///
/// @dev Every other suite proves a half. PolicyModule's tests prove `kill` never reverts (D2); CopyVault's
///      prove `unfollow` credits principal before calling it. Neither proves the whole path survives an
///      adversary actively working against it, which is what "the kill switch is guaranteed to free your
///      funds" actually asserts.
///
/// @dev The adversaries here hold every power the deployed system grants, and no more:
///      - **PolicyModule's owner** may toggle the token allowlist and transfer or renounce ownership.
///        It may NOT set, consume or kill a policy — those are `onlyVault`. `test_TheOwnerCannotPreEmpt…`
///        is what makes that a proof rather than a reading of the source.
///      - **The agent's owner** may deactivate the agent, one way.
///      - **The runner** may record fills and mirror them.
///      Exit is `unfollow` then `withdraw`. "Principal" means what was committed at `follow`; positions are
///      bookkeeping and are deliberately not returned (v2.2 §7.3).
contract LivenessTest is Test {
    uint256 internal constant CAP = 60e6; // 60 USDG, the PRD's demo cap
    uint256 internal constant ONE_STOCK = 1e18;
    uint256 internal constant PRICE = 12_841e6; // $128.41 on an 8-decimal feed
    /// @dev floor(CAP * 1e20 / PRICE): notional rounds up to exactly CAP, and one more unit of size would
    ///      round up to CAP + 1. Checked against the vault in `test_AnExhaustedCapCannotTrapPrincipal`.
    uint256 internal constant EXHAUSTING_SIZE = 467_253_329_179_970_407;

    AgentRegistry internal registry;
    TrackRecord internal record;
    PolicyModule internal policy;
    CopyVault internal vault;
    MockUSDG internal usdg;
    MockStock internal stock;

    uint256 internal agentId;

    // Adversaries, deliberately distinct keys — §6 step 5 requires the admin key be separate.
    address internal admin = makeAddr("policyAdmin");
    address internal agentOwner = makeAddr("agentOwner");
    address internal runner = makeAddr("runner");

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        registry = new AgentRegistry();
        vm.prank(agentOwner);
        agentId = registry.registerAgent("Pulse", keccak256("pulse"), "v1");

        record = new TrackRecord(address(registry), runner);
        usdg = new MockUSDG();
        stock = new MockStock("Mock NVDA", "mNVDA");

        // PolicyModule is deployed first and receives CopyVault's predicted CREATE address (§6).
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        policy = new PolicyModule(predicted, admin);
        vault = new CopyVault(address(record), address(policy), address(usdg), runner);
        assertEq(address(vault), predicted, "policy did not receive the vault's predicted address");

        vm.prank(admin);
        policy.setTokenAllowlist(address(stock), true);
    }

    // --- helpers -----------------------------------------------------------

    function _follow(address user, uint256 cap) internal {
        usdg.mint(user, cap);
        vm.startPrank(user);
        usdg.approve(address(vault), cap);
        vault.deposit(cap);
        vault.follow(agentId, cap, 50);
        vm.stopPrank();
    }

    /// @dev The exit, asserted rather than assumed: unfollow must not revert, must return the whole
    ///      principal, and withdraw must actually move the tokens.
    function _exitAndAssertWholePrincipalReturned(address user, uint256 expected) internal {
        uint256 walletBefore = usdg.balanceOf(user);

        vm.prank(user);
        vault.unfollow(agentId);
        assertEq(vault.balanceOf(user), expected, "unfollow did not credit the whole principal");
        assertEq(vault.allocationOf(user, agentId), 0, "principal still allocated after unfollow");

        vm.prank(user);
        vault.withdraw(expected);
        assertEq(usdg.balanceOf(user) - walletBefore, expected, "withdraw did not move the principal");
        assertEq(vault.balanceOf(user), 0, "vault still holds a balance for the user");
    }

    /// @dev §13 test 1. The vault must always be able to honour everything it owes.
    function _assertSolvent() internal view {
        uint256 owed = vault.balanceOf(alice) + vault.balanceOf(bob) + vault.allocationOf(alice, agentId)
            + vault.allocationOf(bob, agentId);
        assertGe(usdg.balanceOf(address(vault)), owed, "vault cannot cover free balances plus principal");
    }

    function _recordAndMirror(bool isBuy, uint256 size) internal {
        vm.prank(runner);
        uint256 fillId = record.recordFill(agentId, address(stock), isBuy, size, PRICE, bytes32("round"));
        vm.prank(runner);
        vault.mirrorFill(fillId);
    }

    // --- the adversaries, one at a time ------------------------------------

    /// @dev The agent's owner deactivates it. Deactivation is one-way, so this is the most permanent
    ///      hostile act available to an agent, and it must not reach a follower's money.
    function test_ADeactivatedAgentCannotTrapPrincipal() public {
        _follow(alice, CAP);

        vm.prank(agentOwner);
        registry.deactivateAgent(agentId);

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _assertSolvent();
    }

    /// @dev The admin removes the token mid-life. This stops mirroring in both directions by design
    ///      (v2.2 §7.3) — the point here is that it cannot also strand the follower.
    function test_RemovingTheTokenFromTheAllowlistCannotTrapPrincipal() public {
        _follow(alice, CAP);
        _recordAndMirror(true, ONE_STOCK / 10);

        vm.prank(admin);
        policy.setTokenAllowlist(address(stock), false);
        assertFalse(policy.isTokenAllowed(address(stock)), "token still allowlisted");

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _assertSolvent();
    }

    /// @dev The cap is fully spent, so every further buy is refused. A follower whose policy can no
    ///      longer accept anything must still be able to leave.
    function test_AnExhaustedCapCannotTrapPrincipal() public {
        _follow(alice, CAP);

        // The largest size whose rounded-up notional is exactly the cap: 60.000000 USDG, nothing left.
        _recordAndMirror(true, EXHAUSTING_SIZE);
        assertEq(policy.spentToday(alice, agentId), CAP, "the cap was not spent to the last unit");
        uint256 held = vault.positionOf(alice, agentId, address(stock));
        assertEq(held, EXHAUSTING_SIZE, "the exhausting buy was not mirrored");

        // The smallest buy there is: size 1 rounds up to a notional of 1, one unit over the cap.
        vm.prank(runner);
        uint256 overId = record.recordFill(agentId, address(stock), true, 1, PRICE, bytes32("over"));
        vm.recordLogs();
        vm.prank(runner);
        vault.mirrorFill(overId);

        // Refused, logged, and nothing moved. Without these the test would pass on a vault that quietly
        // accepted the buy, and "exhausted" would be a word in the name rather than a fact.
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1, "expected exactly one log from the over-cap mirror");
        assertEq(logs[0].emitter, address(vault), "the log did not come from the vault");
        assertEq(logs[0].topics[0], ICopyVault.MirrorRejected.selector, "the over-cap buy was not rejected");
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice, "rejection names the wrong follower");
        assertEq(uint256(logs[0].topics[2]), agentId, "rejection names the wrong agent");
        assertEq(uint256(logs[0].topics[3]), overId, "rejection names the wrong fill");
        assertEq(
            abi.decode(logs[0].data, (bytes)),
            abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, CAP + 1, CAP),
            "rejected for the wrong reason"
        );
        assertEq(policy.spentToday(alice, agentId), CAP, "a refused buy still consumed cap");
        assertEq(vault.positionOf(alice, agentId, address(stock)), held, "a refused buy still moved the position");

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _assertSolvent();
    }

    /// @dev Ownership renounced: the allowlist is frozen forever in whatever state it was left. Even
    ///      frozen hostile — token switched off and nobody able to switch it back — exit must work.
    function test_ARenouncedOwnerWhoLeftTheTokenOffCannotTrapPrincipal() public {
        _follow(alice, CAP);

        vm.startPrank(admin);
        policy.setTokenAllowlist(address(stock), false);
        policy.renounceOwnership();
        vm.stopPrank();
        assertEq(policy.owner(), address(0), "ownership was not renounced");

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _assertSolvent();
    }

    /// @dev The runner mirrors relentlessly, piling up position state against the follower. Positions
    ///      are not returned on exit; principal is. This is the case that would catch an exit path that
    ///      had to loop over accumulated positions.
    function test_AdversarialMirroringCannotTrapPrincipal() public {
        _follow(alice, CAP);

        for (uint256 i = 0; i < 12; i++) {
            _recordAndMirror(true, ONE_STOCK / 1000);
        }
        assertGt(vault.positionOf(alice, agentId, address(stock)), 0, "no position accumulated");

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _assertSolvent();
    }

    /// @dev The load-bearing one. PolicyModule's owner must have no path to the kill switch, because a
    ///      follower's exit calls `kill` and an owner who could pre-empt or block it would own the exit.
    function test_TheOwnerCannotPreEmptTheKillSwitch() public {
        _follow(alice, CAP);

        vm.startPrank(admin);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.kill(alice, agentId);

        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.setPolicy(alice, agentId, 0, 0);

        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.checkAndConsume(alice, agentId, address(stock), 1, true);
        vm.stopPrank();

        // The follow is untouched, and the follower's own exit still works.
        assertTrue(policy.getPolicy(alice, agentId).active, "owner disturbed the policy");
        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _assertSolvent();
    }

    /// @dev One follower leaving must not affect another's ability to leave — the swap-removal in
    ///      `unfollow` rewrites the follower list, and a bug there could strand whoever was moved.
    function test_OneFollowersExitDoesNotStrandAnother() public {
        _follow(alice, CAP);
        _follow(bob, CAP);

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        assertEq(vault.allocationOf(bob, agentId), CAP, "alice's exit moved bob's principal");

        _exitAndAssertWholePrincipalReturned(bob, CAP);
        _assertSolvent();
    }

    // --- everything at once, in any order ----------------------------------

    /// @dev The claim is "whatever they do", so a fixed script is not enough. Five hostile acts, each on or
    ///      off, in either of two orders, is only 64 combinations — so every one is run from the same clean
    ///      state rather than sampled. Even sampling uniformly, 256 fuzz runs would be expected to miss one.
    function test_NoCombinationOfHostileActsCanTrapPrincipal() public {
        uint256 clean = vm.snapshotState();
        for (uint256 acts = 0; acts < 32; acts++) {
            _runHostileScenario(uint8(acts), false);
            vm.revertToState(clean);
            _runHostileScenario(uint8(acts), true);
            vm.revertToState(clean);
        }
    }

    /// @dev One combination. Each bit of `acts` turns on one hostile act; `hostileFirst` decides whether
    ///      the admin moves before or after the runner.
    ///
    ///      Deactivation always comes last because it is the one act that ends mirroring for good:
    ///      `recordFill` refuses an inactive agent, so there is nothing to mirror after it. Dropping the
    ///      token or renouncing does not stop the runner — a mirror after a drop still runs, and every
    ///      follower is refused with `TokenNotAllowed`. That is the ordering worth testing, because it is
    ///      where the vault handles a rejection it did not cause.
    function _runHostileScenario(uint8 acts, bool hostileFirst) internal {
        console.log("scenario: acts", uint256(acts), "hostileFirst", hostileFirst);
        _follow(alice, CAP);
        _follow(bob, CAP);

        bool deactivate = acts & 1 != 0;
        bool dropToken = acts & 2 != 0;
        bool exhaustCap = acts & 4 != 0;
        bool mirrorHard = acts & 8 != 0;
        bool renounce = acts & 16 != 0;

        if (hostileFirst) _dropTokenThenRenounce(dropToken, renounce);

        // Spend each follower's cap to the last unit, then keep buying into it: every later buy is a
        // CapExceeded rejection rather than a mirror.
        vm.recordLogs();
        uint256 fills;
        if (exhaustCap) {
            _recordAndMirror(true, EXHAUSTING_SIZE);
            fills++;
        }
        if (mirrorHard) {
            for (uint256 i = 0; i < 5; i++) {
                _recordAndMirror(true, ONE_STOCK / 1000);
                fills++;
            }
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();

        if (!hostileFirst) _dropTokenThenRenounce(dropToken, renounce);

        // Prove the mirroring above did what this ordering says it should, so no combination passes by
        // quietly skipping the part it was meant to exercise.
        if (fills > 0) {
            bool refused = hostileFirst && dropToken;
            (uint256 mirrored, uint256 tokenRefusals) = _countMirrorOutcomes(logs);
            for (uint256 i = 0; i < 2; i++) {
                address user = i == 0 ? alice : bob;
                uint256 held = vault.positionOf(user, agentId, address(stock));
                if (refused) assertEq(held, 0, "a mirror after the token was dropped was accepted");
                else assertGt(held, 0, "a mirror with the token allowed was not accepted");
            }
            if (refused) {
                assertEq(tokenRefusals, 2 * fills, "not every follower was refused for the dropped token");
                assertEq(mirrored, 0, "something mirrored after the token was dropped");
            } else {
                assertGt(mirrored, 0, "nothing mirrored with the token allowed");
                assertEq(tokenRefusals, 0, "a follower was refused for a token that was allowed");
            }
        }

        if (deactivate) {
            vm.prank(agentOwner);
            registry.deactivateAgent(agentId);
        }

        _exitAndAssertWholePrincipalReturned(alice, CAP);
        _exitAndAssertWholePrincipalReturned(bob, CAP);
        _assertSolvent();

        // The vault owes nothing and kept nothing that was not donated to it.
        assertEq(usdg.balanceOf(address(vault)), 0, "vault retained principal after everyone left");
    }

    /// @dev Counts the vault's per-follower outcomes in a batch of logs: successful mirrors, and
    ///      rejections whose reason is exactly `TokenNotAllowed(stock)`.
    function _countMirrorOutcomes(Vm.Log[] memory logs)
        internal
        view
        returns (uint256 mirrored, uint256 tokenRefusals)
    {
        bytes memory notAllowed = abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, address(stock));
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(vault)) continue;
            if (logs[i].topics[0] == ICopyVault.Mirrored.selector) {
                mirrored++;
            } else if (logs[i].topics[0] == ICopyVault.MirrorRejected.selector) {
                if (keccak256(abi.decode(logs[i].data, (bytes))) == keccak256(notAllowed)) tokenRefusals++;
            }
        }
    }

    /// @dev In this order because a renounced owner can no longer drop anything.
    function _dropTokenThenRenounce(bool dropToken, bool renounce) internal {
        if (dropToken) {
            vm.prank(admin);
            policy.setTokenAllowlist(address(stock), false);
        }
        if (renounce) {
            vm.prank(admin);
            policy.renounceOwnership();
        }
    }
}
