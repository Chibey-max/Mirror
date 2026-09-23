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

/// @title MirrorFillIsolationTest
/// @notice **PRD v2.2 Section 13 test 2.** One follower's cap or position can never make `mirrorFill` revert,
///         and never changes what happens to any other follower in the same fill (§7.2).
///
/// @dev Every run follows with 2–5 followers: one whose cap every buy is over, one whose cap no buy reaches, and
///      up to three with random caps on the scale of a fill. Then 20 random buys and sells with time passing,
///      and a closing sell bigger than anything held. For every fill it checks that `mirrorFill` did not revert
///      and that each follower got exactly what *their own* cap and position predict — mirrored at the right
///      size, refused for the right reason, or untouched — using a model that knows nothing about the others.
///
///      The tight and roomy followers make every buy a fill where one is refused and another mirrors; the
///      closing sell clamps whoever still holds; a forced midnight halfway through means every run crosses a
///      day boundary. Each run asserts it reached all three, so none can pass by avoiding the hard part.
contract MirrorFillIsolationTest is Test {
    uint256 internal constant PRICE = 12_841e6; // $128.41 on an 8-decimal feed
    uint256 internal constant STEPS = 20;
    uint256 internal constant MIN_SIZE = 1e16; // 0.01 mNVDA = 1.2841 USDG, already over the tight cap
    uint256 internal constant MAX_SIZE = 5e17; // 0.5 mNVDA = 64.205 USDG
    uint256 internal constant TIGHT_CAP = 1e6; // 1 USDG: every buy this test makes is over it
    uint256 internal constant ROOMY_CAP = 1_000_000e6; // 20 buys come to at most ~1,284 USDG

    AgentRegistry internal registry;
    TrackRecord internal record;
    PolicyModule internal policy;
    CopyVault internal vault;
    MockUSDG internal usdg;
    MockStock internal stock;
    uint256 internal agentId;

    address internal admin = makeAddr("policyAdmin");
    address internal agentOwner = makeAddr("agentOwner");
    address internal runner = makeAddr("runner");

    // --- the model: what each follower's own cap and position say should happen ------------------------------
    address[] internal followers;
    mapping(address => uint256) internal capOf;
    mapping(address => uint256) internal heldOf;
    mapping(address => uint256) internal spentOf;
    mapping(address => uint256) internal spentDayOf;

    uint256 internal fillsWithRefusalAndMirror;
    uint256 internal clampedSells;
    uint256 internal rollovers;

    enum Outcome {
        Untouched,
        Mirrored,
        Refused
    }

    function setUp() public {
        registry = new AgentRegistry();
        vm.prank(agentOwner);
        agentId = registry.registerAgent("Pulse", keccak256("pulse"), "v1");

        record = new TrackRecord(address(registry), runner);
        usdg = new MockUSDG();
        stock = new MockStock("Mock NVDA", "mNVDA");

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        policy = new PolicyModule(predicted, admin);
        vault = new CopyVault(address(record), address(policy), address(usdg), runner);

        address token = address(stock); // read first: an external call here would eat the prank
        vm.prank(admin);
        policy.setTokenAllowlist(token, true);

        vm.warp(1_789_000_000); // 00:26:40 UTC
    }

    /// forge-config: default.fuzz.runs = 256
    function testFuzz_NoSingleFollowerCanRevertMirrorFill(uint256 seed) public {
        _follow(makeAddr("tight"), TIGHT_CAP);
        _follow(makeAddr("roomy"), ROOMY_CAP);
        uint256 extra = _rand(seed, 0, "followers") % 4;
        for (uint256 i = 0; i < extra; i++) {
            _follow(address(uint160(0xF011 + i)), bound(_rand(seed, i, "cap"), 1e6, 80e6));
        }

        uint256 bought;
        for (uint256 step = 0; step < STEPS; step++) {
            _advanceTime(seed, step);
            // The first and last are buys: the first guarantees a refused-and-mirrored fill, the last that
            // somebody holds something for the closing sell to clamp.
            bool isBuy = step == 0 || step == STEPS - 1 || _rand(seed, step, "side") % 3 != 0;
            uint256 size = bound(_rand(seed, step, "size"), MIN_SIZE, MAX_SIZE);
            if (isBuy) bought += size;
            _mirrorAndCheck(isBuy, size);
        }
        // More than anyone can hold, so every holder is clamped to exactly what they have.
        _mirrorAndCheck(false, bought + 1);

        assertGt(fillsWithRefusalAndMirror, 0, "no fill had one follower refused while another mirrored");
        assertGt(clampedSells, 0, "no sell was ever clamped to what a follower held");
        assertGt(rollovers, 0, "the sequence never crossed a UTC day boundary");
    }

    // --- helpers -----------------------------------------------------------

    function _rand(uint256 seed, uint256 index, string memory what) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, index, what)));
    }

    function _follow(address user, uint256 cap) internal {
        usdg.mint(user, cap);
        vm.startPrank(user);
        usdg.approve(address(vault), cap);
        vault.deposit(cap);
        vault.follow(agentId, cap, 50);
        vm.stopPrank();
        followers.push(user);
        capOf[user] = cap;
    }

    /// @dev Mostly short gaps so several fills share a day and caps can bind; sometimes a whole day; and at the
    ///      halfway step a jump to just past midnight, so every run has at least one rollover.
    function _advanceTime(uint256 seed, uint256 step) internal {
        uint256 dayBefore = block.timestamp / 1 days;
        if (step == STEPS / 2) {
            vm.warp((dayBefore + 1) * 1 days + 1 minutes);
        } else if (_rand(seed, step, "jump") % 5 == 0) {
            vm.warp(block.timestamp + 1 days);
        } else {
            vm.warp(block.timestamp + bound(_rand(seed, step, "gap"), 0, 3 hours));
        }
        if (block.timestamp / 1 days != dayBefore) rollovers++;
    }

    function _mirrorAndCheck(bool isBuy, uint256 size) internal {
        vm.prank(runner);
        uint256 fillId = record.recordFill(agentId, address(stock), isBuy, size, PRICE, bytes32("fuzz"));

        vm.recordLogs();
        vm.prank(runner);
        try vault.mirrorFill(fillId) {}
        catch (bytes memory reason) {
            // The claim itself: nothing in one follower's state may stop the fill for everyone.
            fail(string.concat("mirrorFill reverted: ", vm.toString(reason)));
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();

        uint256 mirrored;
        uint256 capRefused;
        for (uint256 i = 0; i < followers.length; i++) {
            Outcome outcome = _checkFollower(logs, followers[i], fillId, isBuy, size);
            if (outcome == Outcome.Mirrored) mirrored++;
            if (outcome == Outcome.Refused) capRefused++;
        }
        uint256 outcomes = mirrored + capRefused;
        assertEq(_vaultLogCount(logs), outcomes, "the vault logged something no follower's state explains");
        if (mirrored > 0 && capRefused > 0) fillsWithRefusalAndMirror++;
    }

    /// @dev One follower in one fill: the vault's outcome, size or reason, position and spend must all match
    ///      what this follower's own state predicts.
    function _checkFollower(Vm.Log[] memory logs, address user, uint256 fillId, bool isBuy, uint256 size)
        internal
        returns (Outcome expected)
    {
        uint256 expectedSize;
        bytes memory expectedReason;
        (expected, expectedSize, expectedReason) = _predict(user, isBuy, size);
        (Outcome actual, uint256 actualSize, bytes memory actualReason) = _observe(logs, user, fillId, isBuy);

        assertEq(uint8(actual), uint8(expected), "a follower got a different outcome than its own state predicts");
        if (expected == Outcome.Mirrored) {
            assertEq(actualSize, expectedSize, "a follower mirrored the wrong size");
            if (!isBuy && expectedSize < size) clampedSells++;
        } else if (expected == Outcome.Refused) {
            assertEq(actualReason, expectedReason, "a follower was refused for the wrong reason");
        }
        assertEq(vault.positionOf(user, agentId, address(stock)), heldOf[user], "a follower's position drifted");
        assertEq(policy.spentToday(user, agentId), spentOf[user], "a follower's spend drifted");
    }

    /// @dev What this follower's cap and position alone say should happen, and the model updated to match. It
    ///      reads nothing about any other follower, which is the point.
    function _predict(address user, bool isBuy, uint256 size)
        internal
        returns (Outcome outcome, uint256 mirroredSize, bytes memory reason)
    {
        uint256 day = block.timestamp / 1 days;
        if (spentDayOf[user] != day) {
            spentOf[user] = 0; // the daily cap resets at 00:00 UTC (§7.6)
            spentDayOf[user] = day;
        }
        if (isBuy) {
            uint256 notional = (size * PRICE + 1e20 - 1) / 1e20; // rounded up, as CopyVault does (§8)
            uint256 attempted = spentOf[user] + notional;
            if (attempted > capOf[user]) {
                return (
                    Outcome.Refused,
                    0,
                    abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, attempted, capOf[user])
                );
            }
            spentOf[user] = attempted;
            heldOf[user] += size;
            return (Outcome.Mirrored, size, "");
        }
        mirroredSize = size < heldOf[user] ? size : heldOf[user];
        if (mirroredSize == 0) return (Outcome.Untouched, 0, "");
        heldOf[user] -= mirroredSize;
        return (Outcome.Mirrored, mirroredSize, "");
    }

    /// @dev What the vault actually logged for this follower in this fill. At most one entry is allowed, and a
    ///      mirror must carry the fill's own side: the frontend shows buy or sell from this flag.
    function _observe(Vm.Log[] memory logs, address user, uint256 fillId, bool isBuy)
        internal
        view
        returns (Outcome outcome, uint256 size, bytes memory reason)
    {
        uint256 found;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(vault)) continue;
            if (address(uint160(uint256(logs[i].topics[1]))) != user) continue;
            assertEq(uint256(logs[i].topics[2]), agentId, "an outcome was logged against the wrong agent");
            assertEq(uint256(logs[i].topics[3]), fillId, "an outcome was logged against the wrong fill");
            found++;
            if (logs[i].topics[0] == ICopyVault.Mirrored.selector) {
                outcome = Outcome.Mirrored;
                size = _mirroredSize(logs[i].data, isBuy);
            } else if (logs[i].topics[0] == ICopyVault.MirrorRejected.selector) {
                outcome = Outcome.Refused;
                reason = abi.decode(logs[i].data, (bytes));
            }
        }
        assertLe(found, 1, "a follower got more than one outcome from one fill");
    }

    function _mirroredSize(bytes memory data, bool isBuy) internal pure returns (uint256 size) {
        bool loggedIsBuy;
        (size, loggedIsBuy) = abi.decode(data, (uint256, bool));
        assertEq(loggedIsBuy, isBuy, "a mirror was logged with the wrong side");
    }

    function _vaultLogCount(Vm.Log[] memory logs) internal view returns (uint256 count) {
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(vault)) count++;
        }
    }
}

/// @title SolvencyHandler
/// @notice Drives the whole system the way real use plus a hostile admin would: money in and out,
///         follows and exits, the runner mirroring, the allowlist flipping, an agent dying, days passing.
///
/// @dev Every action guards its own preconditions so it cannot revert, which is what lets the suite run
///      with `fail_on_revert = true`. That flag is not decoration: without it Foundry discards a reverting
///      handler call and a suite can pass while doing almost nothing — the trap Jason found in PolicyModule's
///      suite (PM-17), and the reason `test_TheHandlerReachesEverySolvencyOutcome` exists below.
contract SolvencyHandler is Test {
    AgentRegistry public immutable registry;
    TrackRecord public immutable record;
    PolicyModule public immutable policy;
    CopyVault public immutable vault;
    MockUSDG public immutable usdg;
    address public immutable stock;
    address public immutable admin;
    address public immutable agentOwner;
    address public immutable runner;

    /// @dev Two agents. LIVE is never deactivated, so follows stay reachable for the whole run. DOOMED
    ///      can be followed and mirrored while it lives and is then deactivated at a random point, so the
    ///      sequence contains followers whose agent died under them — the exit a dead agent must not block.
    uint256 public constant LIVE = 1;
    uint256 public constant DOOMED = 2;

    address[] internal _users;

    // --- ghost model: what each user has put in and taken out ---------------
    mapping(address => uint256) public deposited;
    mapping(address => uint256) public withdrawn;

    uint256 public follows;
    uint256 public exits;
    uint256 public deactivations;
    uint256 public deadAgentExits;

    // --- reach: which risky states the sequence actually got into, read from the vault's own events ------
    uint256 public buysMirrored; // fills where at least one follower's buy mirrored
    uint256 public sellsMirrored; // fills where at least one follower's sell mirrored
    uint256 public clampedSells; // a follower's sell cut down to what they held
    uint256 public tokenRefusals; // a follower refused because the token was off the allowlist
    uint256 public capRejections; // a follower refused because the buy would exceed their daily cap
    uint256 public capRejectedWhileOthersMirrored; // both in one fill: one follower's cap cannot stop another
    uint256 public capResets; // refused on cap, then a buy that only fits because the UTC day rolled over

    /// @dev The last cap refusal per follow: the UTC day (+1, so 0 means none) and what had been spent.
    struct Refusal {
        uint256 dayPlusOne;
        uint256 spent;
    }

    mapping(address => mapping(uint256 => Refusal)) internal _lastCapRefusal;

    constructor(
        AgentRegistry registry_,
        TrackRecord record_,
        PolicyModule policy_,
        CopyVault vault_,
        MockUSDG usdg_,
        address stock_,
        address admin_,
        address agentOwner_,
        address runner_
    ) {
        registry = registry_;
        record = record_;
        policy = policy_;
        vault = vault_;
        usdg = usdg_;
        stock = stock_;
        admin = admin_;
        agentOwner = agentOwner_;
        runner = runner_;
        for (uint256 i = 0; i < 4; i++) {
            _users.push(address(uint160(0xD00D + i)));
        }
    }

    function userCount() external view returns (uint256) {
        return _users.length;
    }

    function userAt(uint256 i) external view returns (address) {
        return _users[i];
    }

    function _pick(uint256 seed) internal view returns (address) {
        return _users[seed % _users.length];
    }

    function _agentFor(uint256 seed) internal pure returns (uint256) {
        return seed % 2 == 0 ? LIVE : DOOMED;
    }

    // --- actions -----------------------------------------------------------

    function deposit(uint256 userSeed, uint96 amountSeed) external {
        _deposit(_pick(userSeed), bound(uint256(amountSeed), 0, 1000e6));
    }

    function _deposit(address user, uint256 amount) internal {
        usdg.mint(user, amount);
        vm.startPrank(user);
        usdg.approve(address(vault), amount);
        vault.deposit(amount);
        vm.stopPrank();
        deposited[user] += amount;
    }

    function withdraw(uint256 userSeed, uint96 amountSeed) external {
        address user = _pick(userSeed);
        uint256 free = vault.balanceOf(user);
        if (free == 0) return;
        uint256 amount = bound(uint256(amountSeed), 1, free);
        vm.prank(user);
        vault.withdraw(amount);
        withdrawn[user] += amount;
    }

    function follow(uint256 userSeed, uint256 agentSeed, uint96 capSeed) external {
        address user = _pick(userSeed);
        uint256 agent = _agentFor(agentSeed);
        // Already following the seeded agent: try the other, so fewer calls in the sequence are no-ops.
        if (vault.allocationOf(user, agent) != 0) agent = agent == LIVE ? DOOMED : LIVE;
        // A dead agent refuses new followers (AgentInactive). Only the follow is refused; the exit below is not.
        if (!registry.getAgent(agent).active) return;
        if (vault.allocationOf(user, agent) != 0) return;
        if (vault.followerCountOf(agent) >= vault.MAX_FOLLOWERS_PER_AGENT()) return;
        // Caps on the same scale as one fill (at most ~64 USDG), so some bind and some don't: that spread
        // is what puts a capped follower and an uncapped one in the same fill. Never zero — a zero-cap
        // follow is legal, but allocationOf cannot tell it from not following.
        uint256 cap = bound(uint256(capSeed), 1e6, 80e6);
        uint256 free = vault.balanceOf(user);
        if (free < cap) _deposit(user, cap - free);
        vm.prank(user);
        vault.follow(agent, cap, 50);
        follows++;
    }

    /// @dev Deliberately no activity guard: leaving must work whether or not the agent is still alive.
    function unfollow(uint256 userSeed, uint256 agentSeed) external {
        address user = _pick(userSeed);
        uint256 agent = _agentFor(agentSeed);
        // Not following the seeded agent: try the other, so fewer calls in the sequence are no-ops.
        if (vault.allocationOf(user, agent) == 0) agent = agent == LIVE ? DOOMED : LIVE;
        if (vault.allocationOf(user, agent) == 0) return;
        bool agentDead = !registry.getAgent(agent).active;
        vm.prank(user);
        vault.unfollow(agent);
        exits++;
        // A re-follow can carry a different cap, which would make a later buy fit for the wrong reason.
        delete _lastCapRefusal[user][agent];
        if (agentDead) deadAgentExits++;
    }

    /// @dev The runner records a fill and mirrors it. Sizes stay well inside the notional headroom so
    ///      this exercises the loop rather than the overflow guard.
    function mirror(uint256 agentSeed, uint96 sizeSeed, uint8 flags) external {
        uint256 agent = _agentFor(agentSeed);
        // recordFill refuses an inactive agent, so once DOOMED is dead its fills go to LIVE instead.
        if (!registry.getAgent(agent).active) agent = LIVE;
        uint256 size = bound(uint256(sizeSeed), 1, 5e17);
        bool isBuy = flags % 3 != 0;

        vm.prank(runner);
        uint256 fillId = record.recordFill(agent, stock, isBuy, size, 12_841e6, bytes32("r"));
        vm.recordLogs();
        vm.prank(runner);
        vault.mirrorFill(fillId);
        _tallyOutcomes(vm.getRecordedLogs(), agent, isBuy, size, _ceilNotional(size, 12_841e6));
    }

    /// @dev Reads the vault's `Mirrored` / `MirrorRejected` logs for one fill and counts what happened, so
    ///      the reachability claims rest on what the vault did, not on what the handler expected it to do.
    function _tallyOutcomes(Vm.Log[] memory logs, uint256 agent, bool isBuy, uint256 fillSize, uint256 notional)
        internal
    {
        uint256 day = block.timestamp / 1 days;
        uint256 mirroredHere;
        uint256 capRejectedHere;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter != address(vault)) continue;
            address user = address(uint160(uint256(logs[i].topics[1])));
            if (logs[i].topics[0] == ICopyVault.Mirrored.selector) {
                mirroredHere++;
                (uint256 mirroredSize,) = abi.decode(logs[i].data, (uint256, bool));
                if (!isBuy && mirroredSize < fillSize) clampedSells++;
                Refusal memory last = _lastCapRefusal[user][agent];
                if (isBuy && last.dayPlusOne != 0 && day + 1 > last.dayPlusOne) {
                    // Only a reset explains a buy that would not have fitted in what was left that day.
                    uint256 cap = policy.getPolicy(user, agent).maxNotionalPerDay;
                    // Re-follow keeps same-day spend (D4), so the day may have started at or over a smaller cap.
                    if (cap <= last.spent || notional > cap - last.spent) capResets++;
                    delete _lastCapRefusal[user][agent];
                }
            } else if (logs[i].topics[0] == ICopyVault.MirrorRejected.selector) {
                bytes4 reason = bytes4(abi.decode(logs[i].data, (bytes)));
                if (reason == IPolicyModule.TokenNotAllowed.selector) tokenRefusals++;
                if (reason == IPolicyModule.CapExceeded.selector) {
                    capRejections++;
                    capRejectedHere++;
                    _lastCapRefusal[user][agent] = Refusal(day + 1, policy.spentToday(user, agent));
                }
            }
        }
        if (mirroredHere > 0) {
            if (isBuy) buysMirrored++;
            else sellsMirrored++;
        }
        if (capRejectedHere > 0 && mirroredHere > 0) capRejectedWhileOthersMirrored++;
    }

    /// @dev CopyVault's buy notional: size * price / 1e20, rounded up (v2.2 §8, 18-decimal stock).
    function _ceilNotional(uint256 size, uint256 price) internal pure returns (uint256) {
        return (size * price + 1e20 - 1) / 1e20;
    }

    function toggleAllowlist(uint8 seed) external {
        vm.prank(admin);
        policy.setTokenAllowlist(stock, seed % 4 != 0);
    }

    /// @dev Only the doomed agent, so LIVE keeps the follow path open for the rest of the sequence. Only
    ///      once someone follows it: deactivating an agent nobody follows cannot reach anyone's money.
    function deactivateDoomedAgent() external {
        if (!registry.getAgent(DOOMED).active) return;
        if (vault.followerCountOf(DOOMED) == 0) return;
        vm.prank(agentOwner);
        registry.deactivateAgent(DOOMED);
        deactivations++;
    }

    /// @dev Short steps, so several fills land in one UTC day and caps get a chance to bind before the
    ///      day rolls over — while ~16 steps a run (about two days) still cross a midnight or two.
    function advanceTime(uint32 secondsLater) external {
        vm.warp(block.timestamp + bound(uint256(secondsLater), 1 minutes, 6 hours));
    }
}

/// @title SolvencyInvariantTest
/// @notice PRD v2.2 Section 13 test 1, as a continuously-checked property rather than a scripted case.
///
/// @dev The liveness tests above prove a follower can leave in each named scenario. This proves the
///      vault could pay *everyone* at every point along any random sequence — which is the difference
///      between "Alice got her money back" and "the vault was never short".
contract SolvencyInvariantTest is Test {
    AgentRegistry internal registry;
    TrackRecord internal record;
    PolicyModule internal policy;
    CopyVault internal vault;
    MockUSDG internal usdg;
    MockStock internal stock;
    SolvencyHandler internal handler;

    address internal admin = makeAddr("policyAdmin");
    address internal agentOwner = makeAddr("agentOwner");
    address internal runner = makeAddr("runner");

    function setUp() public {
        registry = new AgentRegistry();
        vm.startPrank(agentOwner);
        registry.registerAgent("Pulse", keccak256("pulse"), "v1"); // id 1, LIVE
        registry.registerAgent("Drift", keccak256("drift"), "v1"); // id 2, DOOMED
        vm.stopPrank();

        record = new TrackRecord(address(registry), runner);
        usdg = new MockUSDG();
        stock = new MockStock("Mock NVDA", "mNVDA");

        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        policy = new PolicyModule(predicted, admin);
        vault = new CopyVault(address(record), address(policy), address(usdg), runner);

        address token = address(stock); // read first: an external call here would eat the prank
        vm.prank(admin);
        policy.setTokenAllowlist(token, true);

        handler = new SolvencyHandler(registry, record, policy, vault, usdg, address(stock), admin, agentOwner, runner);
        vm.warp(1_789_000_000);

        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = SolvencyHandler.deposit.selector;
        selectors[1] = SolvencyHandler.withdraw.selector;
        selectors[2] = SolvencyHandler.follow.selector;
        selectors[3] = SolvencyHandler.unfollow.selector;
        selectors[4] = SolvencyHandler.mirror.selector;
        selectors[5] = SolvencyHandler.toggleAllowlist.selector;
        selectors[6] = SolvencyHandler.deactivateDoomedAgent.selector;
        selectors[7] = SolvencyHandler.advanceTime.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev What a user is owed: their free balance plus the principal committed to either agent.
    function _claim(address user) internal view returns (uint256) {
        return
            vault.balanceOf(user) + vault.allocationOf(user, handler.LIVE())
                + vault.allocationOf(user, handler.DOOMED());
    }

    /// @dev A suite that never follows, mirrors or exits would satisfy every invariant below while
    ///      proving nothing. This drives the handler deliberately and shows each outcome is reachable.
    function test_TheHandlerReachesEverySolvencyOutcome() public {
        address a = handler.userAt(0);
        address b = handler.userAt(1);
        uint256 live = handler.LIVE();

        // Two followers of LIVE, one with room and one with a 1 USDG cap. `follow` tops up the deposit.
        handler.follow(0, 0, 80e6);
        handler.follow(1, 0, 1e6);
        assertEq(handler.follows(), 2, "nobody ever followed");
        assertEq(vault.allocationOf(a, live), 80e6, "the roomy follow did not commit its cap");
        assertEq(vault.allocationOf(b, live), 1e6, "the tight follow did not commit its cap");

        // 0.3 mNVDA = 38.523 USDG: inside a's cap, over b's. One fill, one mirror and one cap refusal.
        handler.mirror(0, 3e17, 1); // flags 1 -> buy
        assertEq(handler.buysMirrored(), 1, "no buy was ever mirrored");
        assertEq(handler.capRejections(), 1, "no follower was ever refused on cap");
        assertEq(handler.capRejectedWhileOthersMirrored(), 1, "a cap refusal never shared a fill with a mirror");

        // Selling 0.4 while holding 0.3: the sell is cut down to what is held.
        handler.mirror(0, 4e17, 0); // flags 0 -> sell
        assertEq(handler.sellsMirrored(), 1, "no sell was ever mirrored");
        assertEq(handler.clampedSells(), 1, "no sell was ever clamped to the held size");
        assertEq(vault.positionOf(a, live, address(stock)), 0, "the clamped sell did not close the position");

        // 0.5 mNVDA (the handler's largest fill) = 64.205 USDG: more than a has left today
        // (80 - 38.523 = 41.477), so refused...
        handler.mirror(0, 5e17, 1);
        assertEq(handler.capRejections(), 3, "the over-remainder buy was not refused for both followers");
        // ...and once the UTC day rolls over, the same buy fits the reset cap. The suite starts at 00:26:40
        // UTC, so four six-hour steps cross midnight.
        for (uint256 i = 0; i < 4; i++) {
            handler.advanceTime(6 hours);
        }
        handler.mirror(0, 5e17, 1);
        assertEq(handler.capResets(), 1, "a refused follower never mirrored again after the cap reset");

        // The admin switches the token off: every follower is refused for it.
        handler.toggleAllowlist(0); // 0 % 4 == 0 -> token off
        assertFalse(policy.isTokenAllowed(address(stock)), "allowlist did not switch off");
        handler.mirror(0, 1e17, 1);
        assertEq(handler.tokenRefusals(), 2, "no follower was ever refused for the token");

        handler.unfollow(0, 0);
        assertEq(handler.exits(), 1, "nobody ever exited");

        // A follower whose agent dies under them, and then leaves it.
        address c = handler.userAt(2);
        handler.follow(2, 1, 50e6); // agent seed 1 -> DOOMED
        assertEq(vault.allocationOf(c, handler.DOOMED()), 50e6, "nobody followed the doomed agent");
        handler.deactivateDoomedAgent();
        assertEq(handler.deactivations(), 1, "an agent was never deactivated");
        handler.unfollow(2, 1);
        assertEq(handler.deadAgentExits(), 1, "nobody ever left a dead agent");
        assertEq(vault.balanceOf(c), 50e6, "leaving a dead agent did not return the principal");

        handler.withdraw(0, type(uint96).max);
        assertGt(handler.withdrawn(a), 0, "nothing was ever withdrawn");
    }

    /// @dev **PRD Section 13 test 1.** The vault must hold at least what it owes: every free balance plus
    ///      every committed principal. If this ever fails, someone's withdrawal is funded by someone
    ///      else's money and the last person out gets nothing.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    /// forge-config: default.invariant.fail_on_revert = true
    function invariant_TheVaultCanAlwaysCoverWhatItOwes() public view {
        uint256 owed;
        for (uint256 i = 0; i < handler.userCount(); i++) {
            address user = handler.userAt(i);
            owed += _claim(user);
        }
        assertGe(usdg.balanceOf(address(vault)), owed, "vault is short of what it owes");
    }

    /// @dev The stronger statement, and the one that would catch a subtler bug: each user's claim is
    ///      exactly what they put in less what they took out. Mirroring, the allowlist, a dead agent
    ///      and the passing of days move positions and caps — none of them may move money.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    /// forge-config: default.invariant.fail_on_revert = true
    function invariant_EveryUsersClaimIsExactlyWhatTheyPutIn() public view {
        for (uint256 i = 0; i < handler.userCount(); i++) {
            address user = handler.userAt(i);
            assertEq(
                _claim(user),
                handler.deposited(user) - handler.withdrawn(user),
                "a user's claim drifted from their net deposits"
            );
        }
    }

    /// @dev No USDG is created or destroyed by anything the system does.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    /// forge-config: default.invariant.fail_on_revert = true
    function invariant_TheVaultHoldsExactlyTheNetDeposits() public view {
        uint256 net;
        for (uint256 i = 0; i < handler.userCount(); i++) {
            address user = handler.userAt(i);
            net += handler.deposited(user) - handler.withdrawn(user);
        }
        assertEq(usdg.balanceOf(address(vault)), net, "vault balance drifted from net deposits");
    }
}
