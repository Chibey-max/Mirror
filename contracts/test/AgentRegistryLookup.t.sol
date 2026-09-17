// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";

/// @title AgentRegistryLookupTest
/// @notice Pins the registry behaviour TrackRecord's recordFill depends on. Owner: Isaac.
///
/// @dev TrackRecord trusts two things about getAgent: an unknown id returns owner == address(0)
///      rather than reverting, and `active` reflects deactivation. If either changes — for example,
///      someone "improves" getAgent to revert on unknown ids — recordFill stops raising AgentNotFound
///      and bubbles an opaque registry revert instead. This file fails first.
///
/// @dev Runs through the real TrackRecord.recordFill as the runner, across a real contract boundary.
///      Until TrackRecord's body landed, a harness here copied the PRD v2.2 Section 5.2 check verbatim.
contract AgentRegistryLookupTest is Test {
    AgentRegistry internal registry;
    TrackRecord internal trackRecord;

    address internal alice = makeAddr("alice");
    address internal runner = makeAddr("runner");
    address internal token = makeAddr("mNVDA");

    function setUp() public {
        registry = new AgentRegistry();
        trackRecord = new TrackRecord(address(registry), runner);
    }

    function _register() internal returns (uint256 agentId) {
        vm.prank(alice);
        agentId = registry.registerAgent("Pulse", keccak256("pulse-strategy"), "pulse-v1.2");
    }

    /// @dev Records a minimal valid fill for agentId, so the agent check is the only thing that can fail.
    function _recordFor(uint256 agentId) internal {
        vm.prank(runner);
        trackRecord.recordFill(agentId, token, true, 1, 1, bytes32(uint256(1)));
    }

    function test_UnknownIdsAreAgentNotFound() public {
        _register();

        uint256[3] memory unknown = [uint256(0), 2, type(uint256).max];
        for (uint256 i = 0; i < unknown.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentNotFound.selector, unknown[i]));
            _recordFor(unknown[i]);
        }
    }

    function test_RegisteredActiveAgentPasses() public {
        _recordFor(_register());
        assertEq(trackRecord.fillCount(), 1);
    }

    function test_DeactivatedAgentIsAgentInactive() public {
        uint256 agentId = _register();
        vm.prank(alice);
        registry.deactivateAgent(agentId);

        vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentInactive.selector, agentId));
        _recordFor(agentId);
    }

    /// @dev Over any number of agents, any subset deactivated, and any queried id, recordFill's verdict
    ///      is exactly: not found outside 1..agentCount, inactive if deactivated, otherwise it records.
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

        bool expectNotFound = queriedId == 0 || queriedId > agents;
        bool expectInactive = !expectNotFound && (deactivatedMask >> queriedId) & 1 == 1;
        if (expectNotFound) {
            vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentNotFound.selector, queriedId));
        } else if (expectInactive) {
            vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentInactive.selector, queriedId));
        }
        _recordFor(queriedId);

        assertEq(trackRecord.fillCount(), expectNotFound || expectInactive ? 0 : 1);
    }
}
