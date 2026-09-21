// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {PolicyModule} from "../src/PolicyModule.sol";

/// @title PolicyModuleHandler
/// @notice Drives PolicyModule the way the system will: the vault follows, consumes and kills,
///         the owner touches the allowlist, strangers try anything, and time moves forward across
///         UTC day boundaries.
///
/// @dev The handler predicts each call's outcome from its own ghost model BEFORE making it, then
///      compares. A model that only recorded what happened would agree with any bug; this one
///      disagrees, and every disagreement is counted.
contract PolicyModuleHandler is Test {
    PolicyModule public immutable policy;
    address public immutable vault;
    address public immutable admin;

    /// @dev The one allowlistable token, and one that is never allowlisted.
    address public constant TOKEN = address(0x70C0);
    address public constant OTHER_TOKEN = address(0x70C1);

    address[] internal _users;
    uint256[] internal _agents;
    address[] internal _strangers;

    // --- ghost model -------------------------------------------------------
    mapping(address => mapping(uint256 => uint256)) public modelCap;
    mapping(address => mapping(uint256 => bool)) public modelActive;
    /// @dev user => agent => day index => spend the model expects.
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public modelSpent;
    bool public modelTokenAllowed;

    uint256 public acceptedBuys;
    uint256 public acceptedSells;
    uint256 public rejectedByCap;
    uint256 public rejectedByInactive;
    uint256 public rejectedByToken;
    uint256 public unexpectedOutcomes;
    uint256 public rejectionsThatMovedSpend;
    uint256 public unauthorisedWritesThatLanded;
    uint256 public ownerActionsThatMovedState;
    uint256 public spendDecreases;

    constructor(PolicyModule policy_, address vault_, address admin_, bool tokenAllowedAtStart) {
        policy = policy_;
        vault = vault_;
        admin = admin_;
        modelTokenAllowed = tokenAllowedAtStart;
        for (uint256 i = 0; i < 3; i++) {
            _users.push(address(uint160(0xA11CE + i)));
        }
        for (uint256 i = 0; i < 2; i++) {
            _agents.push(7 + i);
            _strangers.push(address(uint160(0x5714 + i)));
        }
    }

    /// @dev Called once from setUp: every pair starts as a live follow, the way the system looks
    ///      after people have followed. Without it a sequence spends itself on PolicyInactive
    ///      before it ever reaches the cap.
    function seedFollows(uint256 cap) external {
        for (uint256 i = 0; i < _users.length; i++) {
            for (uint256 j = 0; j < _agents.length; j++) {
                vm.prank(vault);
                policy.setPolicy(_users[i], _agents[j], cap, 50);
                modelCap[_users[i]][_agents[j]] = cap;
                modelActive[_users[i]][_agents[j]] = true;
            }
        }
    }

    function userCount() external view returns (uint256) {
        return _users.length;
    }

    function agentCount() external view returns (uint256) {
        return _agents.length;
    }

    function userAt(uint256 i) external view returns (address) {
        return _users[i];
    }

    function agentAt(uint256 i) external view returns (uint256) {
        return _agents[i];
    }

    function _pick(uint256 userSeed, uint256 agentSeed) internal view returns (address user, uint256 agentId) {
        user = _users[userSeed % _users.length];
        agentId = _agents[agentSeed % _agents.length];
    }

    function _today() internal view returns (uint256) {
        return block.timestamp / 1 days;
    }

    // --- actions -----------------------------------------------------------

    /// @dev CopyVault.follow. Note what the model does NOT do: clear the day's spend (D4).
    function setPolicy(uint256 userSeed, uint256 agentSeed, uint256 capSeed, uint256 slippage) external {
        (address user, uint256 agentId) = _pick(userSeed, agentSeed);
        uint256 cap = capSeed % 11 == 0 ? type(uint256).max : bound(capSeed, 0, 1000e6);

        vm.prank(vault);
        policy.setPolicy(user, agentId, cap, slippage);

        modelCap[user][agentId] = cap;
        modelActive[user][agentId] = true;
    }

    /// @dev CopyVault.mirrorFill's per-follower gate.
    function consume(uint256 userSeed, uint256 agentSeed, uint256 notionalSeed, uint256 flagSeed) external {
        (address user, uint256 agentId) = _pick(userSeed, agentSeed);
        // Deliberate mix: mostly buys against the allowlisted token, because that is the path the
        // cap lives on. An even split would spend the sequence on TokenNotAllowed instead.
        bool isBuy = flagSeed % 4 != 0;
        address token = flagSeed % 5 == 0 ? OTHER_TOKEN : TOKEN;
        // Mostly realistic notionals, occasionally the extreme that exercises the headroom check.
        uint256 notional = notionalSeed % 13 == 0 ? type(uint256).max : bound(notionalSeed, 0, 120e6);

        uint256 day = _today();
        uint256 spentBefore = policy.spentToday(user, agentId);
        bytes memory expected = _expectedRevert(user, agentId, token, notional, isBuy, spentBefore);

        vm.prank(vault);
        try policy.checkAndConsume(user, agentId, token, notional, isBuy) {
            if (expected.length != 0) unexpectedOutcomes++;
            if (isBuy) {
                modelSpent[user][agentId][day] += notional;
                acceptedBuys++;
            } else {
                acceptedSells++;
            }
        } catch (bytes memory reason) {
            if (expected.length == 0 || keccak256(reason) != keccak256(expected)) unexpectedOutcomes++;
            if (policy.spentToday(user, agentId) != spentBefore) rejectionsThatMovedSpend++;

            bytes4 which = bytes4(reason);
            if (which == IPolicyModule.CapExceeded.selector) rejectedByCap++;
            else if (which == IPolicyModule.PolicyInactive.selector) rejectedByInactive++;
            else if (which == IPolicyModule.TokenNotAllowed.selector) rejectedByToken++;
        }

        if (policy.spentToday(user, agentId) < spentBefore) spendDecreases++;
    }

    /// @dev What the contract should have done, decided before the call is made.
    function _expectedRevert(
        address user,
        uint256 agentId,
        address token,
        uint256 notional,
        bool isBuy,
        uint256 spentBefore
    ) internal view returns (bytes memory) {
        if (!modelActive[user][agentId]) {
            return abi.encodeWithSelector(IPolicyModule.PolicyInactive.selector);
        }
        if (token != TOKEN || !modelTokenAllowed) {
            return abi.encodeWithSelector(IPolicyModule.TokenNotAllowed.selector, token);
        }
        if (!isBuy) return "";

        uint256 cap = modelCap[user][agentId];
        if (notional > type(uint256).max - spentBefore) {
            return abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, type(uint256).max, cap);
        }
        if (spentBefore + notional > cap) {
            return abi.encodeWithSelector(IPolicyModule.CapExceeded.selector, spentBefore + notional, cap);
        }
        return "";
    }

    /// @dev CopyVault.unfollow. A revert here would strand a follower's principal, so an
    ///      unhandled revert failing the whole run is exactly the alarm we want (D2).
    function kill(uint256 userSeed, uint256 agentSeed) external {
        (address user, uint256 agentId) = _pick(userSeed, agentSeed);

        vm.prank(vault);
        policy.kill(user, agentId);

        modelActive[user][agentId] = false;
    }

    function advanceTime(uint32 secondsLater) external {
        vm.warp(block.timestamp + bound(uint256(secondsLater), 1 hours, 3 days));
    }

    function setAllowlist(uint256 seed) external {
        bool allowed = seed % 4 != 0;
        vm.prank(admin);
        policy.setTokenAllowlist(TOKEN, allowed);
        modelTokenAllowed = allowed;
    }

    /// @dev Nobody but the vault writes. Anything that lands here is a hole in access control.
    function writeAsStranger(uint256 strangerSeed, uint256 userSeed, uint256 agentSeed, uint8 which) external {
        address caller = _strangers[strangerSeed % _strangers.length];
        (address user, uint256 agentId) = _pick(userSeed, agentSeed);

        IPolicyModule.Policy memory before = policy.getPolicy(user, agentId);
        uint256 spentBefore = policy.spentToday(user, agentId);

        vm.prank(caller);
        bool landed;
        if (which % 3 == 0) {
            try policy.setPolicy(user, agentId, 1000e6, 1) {
                landed = true;
            } catch {}
        } else if (which % 3 == 1) {
            try policy.checkAndConsume(user, agentId, TOKEN, 1, true) {
                landed = true;
            } catch {}
        } else {
            try policy.kill(user, agentId) {
                landed = true;
            } catch {}
        }

        IPolicyModule.Policy memory nowPolicy = policy.getPolicy(user, agentId);
        bool moved = nowPolicy.maxNotionalPerDay != before.maxNotionalPerDay
            || nowPolicy.maxSlippageBps != before.maxSlippageBps || nowPolicy.active != before.active
            || policy.spentToday(user, agentId) != spentBefore;

        if (landed || moved) unauthorisedWritesThatLanded++;
    }

    /// @dev Everything the owner is allowed to do, done repeatedly. None of it may touch a policy.
    function ownerChurn(uint256 seed) external {
        for (uint256 i = 0; i < _users.length; i++) {
            for (uint256 j = 0; j < _agents.length; j++) {
                _snapshot[i][j] = keccak256(
                    abi.encode(policy.getPolicy(_users[i], _agents[j]), policy.spentToday(_users[i], _agents[j]))
                );
            }
        }

        vm.startPrank(admin);
        policy.setTokenAllowlist(TOKEN, seed % 4 != 0);
        policy.setTokenAllowlist(OTHER_TOKEN, false);
        policy.transferOwnership(admin);
        vm.stopPrank();
        modelTokenAllowed = seed % 4 != 0;

        for (uint256 i = 0; i < _users.length; i++) {
            for (uint256 j = 0; j < _agents.length; j++) {
                bytes32 after_ = keccak256(
                    abi.encode(policy.getPolicy(_users[i], _agents[j]), policy.spentToday(_users[i], _agents[j]))
                );
                if (after_ != _snapshot[i][j]) ownerActionsThatMovedState++;
            }
        }
    }

    mapping(uint256 => mapping(uint256 => bytes32)) internal _snapshot;
}

/// @title PolicyModuleInvariantTest
/// @notice The cap, the allowlist and the kill switch, asserted over random call sequences.
///
/// @dev Ghost comparisons loop over a fixed 3 users x 2 agents, so an invariant's cost does not
///      grow with depth — the trap that made an earlier TrackRecord suite quadratic.
contract PolicyModuleInvariantTest is Test {
    PolicyModule internal policy;
    PolicyModuleHandler internal handler;

    address internal vault = makeAddr("vault");
    address internal admin = makeAddr("admin");

    function setUp() public {
        policy = new PolicyModule(vault, admin);
        handler = new PolicyModuleHandler(policy, vault, admin, true);
        // The allowlist starts on, as it will after deploy step 8, so sequences reach the cap
        // logic instead of stopping at TokenNotAllowed. The handler can still switch it off.
        address demoToken = handler.TOKEN(); // read first: an external call here would eat the prank
        vm.prank(admin);
        policy.setTokenAllowlist(demoToken, true);
        handler.seedFollows(100e6);
        vm.warp(1_789_000_000);

        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = PolicyModuleHandler.setPolicy.selector;
        selectors[1] = PolicyModuleHandler.consume.selector;
        selectors[2] = PolicyModuleHandler.kill.selector;
        selectors[3] = PolicyModuleHandler.advanceTime.selector;
        selectors[4] = PolicyModuleHandler.setAllowlist.selector;
        selectors[5] = PolicyModuleHandler.writeAsStranger.selector;
        selectors[6] = PolicyModuleHandler.ownerChurn.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev An invariant suite that never reaches the cap proves nothing about the cap. A
    ///      per-sequence assertion would be flaky, so this drives the handler deliberately and
    ///      shows every outcome the model predicts is reachable — and that the model agreed with
    ///      the contract in each one. If a later change to the seeds or the mix quietly stops the
    ///      sequences reaching the cap, this fails.
    function test_TheHandlerReachesEveryOutcome() public {
        handler.setAllowlist(1); // 1 % 4 != 0 -> allowlisted

        handler.consume(0, 0, 10e6, 1); // buy, allowlisted token, inside the cap
        assertEq(handler.acceptedBuys(), 1, "no buy was accepted");

        handler.consume(0, 0, 4e6, 4); // 4 % 4 == 0 -> a sell
        assertEq(handler.acceptedSells(), 1, "no sell was accepted");

        handler.consume(0, 0, 120e6, 1); // over the seeded 100 USDG cap
        assertEq(handler.rejectedByCap(), 1, "the cap never rejected anything");

        handler.consume(0, 0, 1e6, 5); // 5 % 5 == 0 -> the token that is never allowlisted
        assertEq(handler.rejectedByToken(), 1, "the allowlist never rejected anything");

        handler.kill(0, 0);
        handler.consume(0, 0, 1e6, 1);
        assertEq(handler.rejectedByInactive(), 1, "a killed follow never rejected anything");

        assertEq(handler.unexpectedOutcomes(), 0, "the model disagreed with the contract");
    }

    /// @dev Every call was allowed or refused exactly as the policy says it should be, with the
    ///      exact error — including which error, since the frontend renders a sentence per error.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_EveryDecisionMatchesThePolicy() public view {
        assertEq(handler.unexpectedOutcomes(), 0, "a call was allowed or refused against the policy");
    }

    /// @dev Today's spend is exactly the buys that were accepted today: sells never add, rejected
    ///      calls never add, and yesterday never carries over.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_SpentTodayIsExactlyTheAcceptedBuys() public view {
        uint256 day = block.timestamp / 1 days;
        for (uint256 i = 0; i < handler.userCount(); i++) {
            for (uint256 j = 0; j < handler.agentCount(); j++) {
                address user = handler.userAt(i);
                uint256 agentId = handler.agentAt(j);
                assertEq(
                    policy.spentToday(user, agentId), handler.modelSpent(user, agentId, day), "spend left the model"
                );
            }
        }
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_ACapAndItsActiveFlagOnlyMoveWhenTheVaultSaysSo() public view {
        for (uint256 i = 0; i < handler.userCount(); i++) {
            for (uint256 j = 0; j < handler.agentCount(); j++) {
                address user = handler.userAt(i);
                uint256 agentId = handler.agentAt(j);
                IPolicyModule.Policy memory p = policy.getPolicy(user, agentId);
                assertEq(p.maxNotionalPerDay, handler.modelCap(user, agentId), "cap left the model");
                assertEq(p.active, handler.modelActive(user, agentId), "active flag left the model");
            }
        }
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_ARejectedCallMovesNothing() public view {
        assertEq(handler.rejectionsThatMovedSpend(), 0, "a rejected call still moved the day's spend");
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_NoOneButTheVaultEverWrites() public view {
        assertEq(handler.unauthorisedWritesThatLanded(), 0, "a non-vault caller wrote to a policy");
    }

    /// @dev The "no admin backdoors" claim, over random sequences rather than one scripted case.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_TheOwnerNeverMovesAPolicy() public view {
        assertEq(handler.ownerActionsThatMovedState(), 0, "an owner action moved a policy or a spend");
    }

    /// @dev Spend only ever climbs within a day. Anything that lowers it hands back cap the agent
    ///      has already used, which is the cap silently getting bigger.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 128
    function invariant_SpendNeverFallsWithinADay() public view {
        assertEq(handler.spendDecreases(), 0, "the day's spend went down");
    }
}
