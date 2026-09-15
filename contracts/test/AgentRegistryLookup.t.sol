// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// @dev The agent check PRD v2.1 Section 5.2 specifies for TrackRecord.recordFill, verbatim: read the
///      Agent once through IAgentRegistry, revert AgentNotFound if owner is zero, revert AgentInactive
///      if not active. Called across a real contract boundary, exactly as TrackRecord will call it.
///      Replace this harness with TrackRecord itself once its body lands.
contract RecordFillAgentGate {
    error AgentNotFound(uint256 agentId);
    error AgentInactive(uint256 agentId);

    IAgentRegistry public immutable registry;

    constructor(IAgentRegistry registry_) {
        registry = registry_;
    }

    function check(uint256 agentId) external view {
        IAgentRegistry.Agent memory a = registry.getAgent(agentId);
        if (a.owner == address(0)) revert AgentNotFound(agentId);
        if (!a.active) revert AgentInactive(agentId);
    }
}

/// @title AgentRegistryLookupTest
/// @notice Pins the registry behaviour TrackRecord's recordFill depends on. Owner: Isaac.
///
/// @dev TrackRecord trusts two things about getAgent: an unknown id returns owner == address(0)
///      rather than reverting, and `active` reflects deactivation. If either changes — for example,
///      someone "improves" getAgent to revert on unknown ids — recordFill stops raising AgentNotFound
///      and bubbles an opaque registry revert instead. This file fails first.
contract AgentRegistryLookupTest is Test {
    AgentRegistry internal registry;
    RecordFillAgentGate internal gate;

    address internal alice = makeAddr("alice");

    function setUp() public {
        registry = new AgentRegistry();
        gate = new RecordFillAgentGate(registry);
    }

    function _register() internal returns (uint256 agentId) {
        vm.prank(alice);
        agentId = registry.registerAgent("Pulse", keccak256("pulse-strategy"), "pulse-v1.2");
    }

    function test_UnknownIdsAreAgentNotFound() public {
        _register();

        uint256[3] memory unknown = [uint256(0), 2, type(uint256).max];
        for (uint256 i = 0; i < unknown.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(RecordFillAgentGate.AgentNotFound.selector, unknown[i]));
            gate.check(unknown[i]);
        }
    }

    function test_RegisteredActiveAgentPasses() public {
        gate.check(_register());
    }

    function test_DeactivatedAgentIsAgentInactive() public {
        uint256 agentId = _register();
        vm.prank(alice);
        registry.deactivateAgent(agentId);

        vm.expectRevert(abi.encodeWithSelector(RecordFillAgentGate.AgentInactive.selector, agentId));
        gate.check(agentId);
    }

    /// @dev The registry's own AgentInactive and TrackRecord's share one selector, so a client decodes
    ///      both with a single error ABI entry.
    function test_RegistryAndTrackRecordAgentInactiveShareASelector() public pure {
        assertEq(IAgentRegistry.AgentInactive.selector, RecordFillAgentGate.AgentInactive.selector);
    }

    /// @dev Over any number of agents, any subset deactivated, and any queried id, the gate's verdict
    ///      is exactly: not found outside 1..agentCount, inactive if deactivated, otherwise it passes.
    function testFuzz_VerdictMatchesRegistryState(uint8 agents, uint256 deactivatedMask, uint256 queriedId) public {
        agents = uint8(bound(agents, 0, 16));
        for (uint256 i = 1; i <= agents; i++) {
            _register();
            if ((deactivatedMask >> i) & 1 == 1) {
                vm.prank(alice);
                registry.deactivateAgent(i);
            }
        }
        queriedId = bound(queriedId, 0, uint256(agents) + 2);

        if (queriedId == 0 || queriedId > agents) {
            vm.expectRevert(abi.encodeWithSelector(RecordFillAgentGate.AgentNotFound.selector, queriedId));
        } else if ((deactivatedMask >> queriedId) & 1 == 1) {
            vm.expectRevert(abi.encodeWithSelector(RecordFillAgentGate.AgentInactive.selector, queriedId));
        }
        gate.check(queriedId);
    }
}
