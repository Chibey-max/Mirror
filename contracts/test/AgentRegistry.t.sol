// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// @title AgentRegistryTest
/// @notice Behaviour of AgentRegistry — PRD v2.1 Section 5.1. Owner: Isaac.
///
/// @dev AgentRegistry is the only place an agentId is defined, so these tests pin the properties
///      everything downstream relies on:
///        - ids run 1..agentCount, sequentially, and id 0 never exists;
///        - every stored field is exactly what was registered, owned by msg.sender;
///        - getAgent never reverts — an unknown id returns the zero struct. TrackRecord's
///          AgentNotFound check (PRD v2.1 Section 5.2) is `owner == address(0)`, so a reverting
///          lookup would bubble an opaque error instead of AgentNotFound.
contract AgentRegistryTest is Test {
    AgentRegistry internal registry;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    bytes32 internal constant PULSE_HASH = keccak256("pulse-strategy");
    bytes32 internal constant RED_HASH = keccak256("red-strategy");

    function setUp() public {
        registry = new AgentRegistry();
        vm.warp(1_789_000_000);
    }

    function _register(address owner, string memory name, bytes32 strategyHash, string memory modelVersion)
        internal
        returns (uint256 agentId)
    {
        vm.prank(owner);
        agentId = registry.registerAgent(name, strategyHash, modelVersion);
    }

    function _assertZeroAgent(uint256 agentId) internal view {
        IAgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(a.owner, address(0), "unknown id has an owner");
        assertEq(bytes(a.name).length, 0, "unknown id has a name");
        assertEq(a.strategyHash, bytes32(0), "unknown id has a strategyHash");
        assertEq(bytes(a.modelVersion).length, 0, "unknown id has a modelVersion");
        assertEq(a.registeredAt, 0, "unknown id has a registeredAt");
        assertFalse(a.active, "unknown id is active");
    }

    // ---------------------------------------------------------------------------------------------
    // registerAgent
    // ---------------------------------------------------------------------------------------------

    function test_RegisterAgent_FirstIdIsOne() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");

        assertEq(agentId, 1, "first agentId must be 1 - id 0 is reserved as 'no agent'");
        assertEq(registry.agentCount(), 1);
    }

    function test_RegisterAgent_IdsAreSequentialAcrossOwners() public {
        assertEq(_register(alice, "Pulse", PULSE_HASH, "pulse-v1.2"), 1);
        assertEq(_register(bob, "Red", RED_HASH, "red-v1.0"), 2);
        assertEq(_register(alice, "Drift", keccak256("drift-strategy"), "drift-v0.9"), 3);

        assertEq(registry.agentCount(), 3);
    }

    function test_RegisterAgent_StoresEveryField() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");

        IAgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(a.owner, alice, "owner must be msg.sender");
        assertEq(a.name, "Pulse");
        assertEq(a.strategyHash, PULSE_HASH);
        assertEq(a.modelVersion, "pulse-v1.2");
        assertEq(a.registeredAt, uint64(block.timestamp), "registeredAt must be the registration block's timestamp");
        assertTrue(a.active, "a new agent must be active");
    }

    /// @dev Exactly one log, from the registry, with the stored values. vm.expectEmit only proves a
    ///      matching event was emitted somewhere in the call — it would not catch a duplicate.
    function test_RegisterAgent_EmitsExactlyOneEventWithTheStoredValues() public {
        vm.recordLogs();
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "registerAgent must emit exactly one event");
        assertEq(logs[0].emitter, address(registry));
        assertEq(logs[0].topics.length, 3, "AgentRegistered has two indexed parameters");
        assertEq(logs[0].topics[0], IAgentRegistry.AgentRegistered.selector);
        assertEq(uint256(logs[0].topics[1]), agentId, "indexed agentId");
        assertEq(address(uint160(uint256(logs[0].topics[2]))), alice, "indexed owner");

        (string memory name, bytes32 strategyHash) = abi.decode(logs[0].data, (string, bytes32));
        assertEq(name, "Pulse");
        assertEq(strategyHash, PULSE_HASH);
    }

    function test_RegisterAgent_RevertsOnEmptyName() public {
        vm.prank(alice);
        vm.expectRevert(IAgentRegistry.EmptyName.selector);
        registry.registerAgent("", PULSE_HASH, "pulse-v1.2");

        assertEq(registry.agentCount(), 0, "a rejected registration must not consume an id");
        _assertZeroAgent(1);
    }

    function test_RegisterAgent_SameOwnerKeepsAgentsIndependent() public {
        uint256 first = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        uint256 second = _register(alice, "Red", RED_HASH, "red-v1.0");

        assertEq(registry.getAgent(first).name, "Pulse");
        assertEq(registry.getAgent(first).strategyHash, PULSE_HASH);
        assertEq(registry.getAgent(second).name, "Red");
        assertEq(registry.getAgent(second).strategyHash, RED_HASH);
    }

    /// @dev ACCEPTED INPUTS (decision D1, audit log AR-03). The frozen ABI defines only EmptyName, so
    ///      a zero strategyHash, an empty modelVersion, a whitespace-only name, and multi-byte unicode
    ///      are all accepted as-is. Pinned here so tightening any of them is a deliberate ABI change
    ///      at the v2.2 sync, not a side effect.
    function test_RegisterAgent_AcceptsInputsTheFrozenAbiCannotReject() public {
        uint256 zeroHash = _register(alice, "Pulse", bytes32(0), "pulse-v1.2");
        assertEq(registry.getAgent(zeroHash).strategyHash, bytes32(0));

        uint256 noModel = _register(alice, "Pulse", PULSE_HASH, "");
        assertEq(bytes(registry.getAgent(noModel).modelVersion).length, 0);

        uint256 whitespace = _register(alice, " ", PULSE_HASH, "pulse-v1.2");
        assertEq(registry.getAgent(whitespace).name, " ");

        uint256 unicodeName = _register(alice, unicode"Pulse 📈 動量", PULSE_HASH, "pulse-v1.2");
        assertEq(registry.getAgent(unicodeName).name, unicode"Pulse 📈 動量");
    }

    /// @dev Any non-empty name, any hash, any modelVersion, at any timestamp, reads back byte-for-byte.
    ///      address(0) is excluded: no one can sign as it, so it can never be msg.sender on-chain.
    function testFuzz_RegisterAgent_RoundTripsExactly(
        address owner,
        string memory name,
        bytes32 strategyHash,
        string memory modelVersion,
        uint64 timestamp
    ) public {
        vm.assume(owner != address(0));
        vm.assume(bytes(name).length > 0);
        vm.warp(timestamp);

        uint256 agentId = _register(owner, name, strategyHash, modelVersion);

        IAgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(agentId, 1);
        assertEq(a.owner, owner);
        assertEq(a.name, name);
        assertEq(a.strategyHash, strategyHash);
        assertEq(a.modelVersion, modelVersion);
        assertEq(a.registeredAt, timestamp);
        assertTrue(a.active);
    }

    // ---------------------------------------------------------------------------------------------
    // deactivateAgent
    // ---------------------------------------------------------------------------------------------

    /// @dev Flips `active` and nothing else. Compared as whole encoded structs so a change to any
    ///      other field — owner, name, strategyHash, modelVersion, registeredAt — fails the test.
    function test_DeactivateAgent_OwnerFlipsActiveAndNothingElse() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        IAgentRegistry.Agent memory expected = registry.getAgent(agentId);
        expected.active = false;

        vm.warp(block.timestamp + 7 days);
        vm.prank(alice);
        registry.deactivateAgent(agentId);

        assertEq(abi.encode(registry.getAgent(agentId)), abi.encode(expected), "deactivation touched more than active");
        assertEq(registry.agentCount(), 1, "deactivation must not change agentCount");
    }

    function test_DeactivateAgent_EmitsExactlyOneEvent() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");

        vm.recordLogs();
        vm.prank(alice);
        registry.deactivateAgent(agentId);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "deactivateAgent must emit exactly one event");
        assertEq(logs[0].emitter, address(registry));
        assertEq(logs[0].topics.length, 2, "AgentDeactivated has one indexed parameter");
        assertEq(logs[0].topics[0], IAgentRegistry.AgentDeactivated.selector);
        assertEq(uint256(logs[0].topics[1]), agentId, "indexed agentId");
        assertEq(logs[0].data.length, 0, "AgentDeactivated carries no data");
    }

    function test_DeactivateAgent_RevertsForNonOwner() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");

        vm.prank(bob);
        vm.expectRevert(IAgentRegistry.NotAgentOwner.selector);
        registry.deactivateAgent(agentId);

        assertTrue(registry.getAgent(agentId).active, "a non-owner deactivated the agent");
    }

    /// @dev An unknown id has owner == address(0), which no msg.sender can ever equal, so the
    ///      ownership check rejects it before anything else runs. Id 0 included.
    function test_DeactivateAgent_RevertsForUnknownIds() public {
        _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");

        vm.startPrank(alice);
        vm.expectRevert(IAgentRegistry.NotAgentOwner.selector);
        registry.deactivateAgent(0);
        vm.expectRevert(IAgentRegistry.NotAgentOwner.selector);
        registry.deactivateAgent(2);
        vm.expectRevert(IAgentRegistry.NotAgentOwner.selector);
        registry.deactivateAgent(type(uint256).max);
        vm.stopPrank();

        _assertZeroAgent(0);
        _assertZeroAgent(2);
    }

    /// @dev Deactivation is one-way (decision D2): a second call is a caller mistake, rejected with
    ///      AgentInactive rather than silently re-emitting AgentDeactivated.
    function test_DeactivateAgent_RevertsWhenAlreadyInactive() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        vm.startPrank(alice);
        registry.deactivateAgent(agentId);

        vm.expectRevert(abi.encodeWithSelector(IAgentRegistry.AgentInactive.selector, agentId));
        registry.deactivateAgent(agentId);
        vm.stopPrank();

        assertFalse(registry.getAgent(agentId).active);
    }

    /// @dev Access control runs before the state check, so a non-owner learns nothing new and gets
    ///      the same error whether or not the agent is still active.
    function test_DeactivateAgent_NonOwnerGetsNotAgentOwnerEvenWhenInactive() public {
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        vm.prank(alice);
        registry.deactivateAgent(agentId);

        vm.prank(bob);
        vm.expectRevert(IAgentRegistry.NotAgentOwner.selector);
        registry.deactivateAgent(agentId);
    }

    function test_DeactivateAgent_LeavesOtherAgentsUntouched() public {
        uint256 pulse = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        uint256 red = _register(alice, "Red", RED_HASH, "red-v1.0");
        uint256 drift = _register(bob, "Drift", keccak256("drift-strategy"), "drift-v0.9");
        bytes memory redBefore = abi.encode(registry.getAgent(red));
        bytes memory driftBefore = abi.encode(registry.getAgent(drift));

        vm.prank(alice);
        registry.deactivateAgent(pulse);

        assertEq(abi.encode(registry.getAgent(red)), redBefore, "same owner's other agent changed");
        assertEq(abi.encode(registry.getAgent(drift)), driftBefore, "another owner's agent changed");
    }

    function testFuzz_DeactivateAgent_OnlyTheOwnerCan(address caller) public {
        vm.assume(caller != alice);
        uint256 agentId = _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");

        vm.prank(caller);
        vm.expectRevert(IAgentRegistry.NotAgentOwner.selector);
        registry.deactivateAgent(agentId);

        vm.prank(alice);
        registry.deactivateAgent(agentId);
        assertFalse(registry.getAgent(agentId).active);
    }

    // ---------------------------------------------------------------------------------------------
    // getAgent / agentCount on ids that were never registered
    // ---------------------------------------------------------------------------------------------

    function test_GetAgent_FreshRegistryHasNoAgents() public view {
        assertEq(registry.agentCount(), 0);
        _assertZeroAgent(0);
        _assertZeroAgent(1);
    }

    function test_GetAgent_UnknownIdsReturnTheZeroStructWithoutReverting() public {
        _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        _register(bob, "Red", RED_HASH, "red-v1.0");

        _assertZeroAgent(0);
        _assertZeroAgent(3);
        _assertZeroAgent(type(uint256).max);
    }

    function testFuzz_GetAgent_OnlyIdsOneThroughCountExist(uint256 agentId) public {
        _register(alice, "Pulse", PULSE_HASH, "pulse-v1.2");
        _register(bob, "Red", RED_HASH, "red-v1.0");
        _register(alice, "Drift", keccak256("drift-strategy"), "drift-v0.9");

        if (agentId >= 1 && agentId <= registry.agentCount()) {
            assertTrue(registry.getAgent(agentId).owner != address(0), "registered id has no owner");
        } else {
            _assertZeroAgent(agentId);
        }
    }
}
