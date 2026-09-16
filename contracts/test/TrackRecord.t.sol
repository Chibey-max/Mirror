// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";

/// @title TrackRecordTest
/// @notice Behaviour of TrackRecord — PRD v2.2 Section 5.2. Owner: Isaac.
///
/// @dev TrackRecord is the tape: the record of what each agent did. These tests pin what its
///      consumers rely on:
///        - it is wired at construction to a real AgentRegistry and a non-zero runner, and neither
///          can change afterwards;
///        - a fresh ledger reads as empty without reverting, because CopyVault's FillNotFound check
///          (PRD v2.2 Section 7.4) is `getFill(fillId).fillId == 0`.
contract TrackRecordTest is Test {
    AgentRegistry internal registry;
    TrackRecord internal trackRecord;

    address internal runner = makeAddr("runner");

    function setUp() public {
        registry = new AgentRegistry();
        trackRecord = new TrackRecord(address(registry), runner);
    }

    // ---------------------------------------------------------------------------------------------
    // constructor
    // ---------------------------------------------------------------------------------------------

    function test_Constructor_StoresRegistryAndRunner() public view {
        assertEq(address(trackRecord.registry()), address(registry), "registry not set from constructor");
        assertEq(trackRecord.runner(), runner, "runner not set from constructor");
    }

    function test_Constructor_RejectsZeroRegistry() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(address(0), runner);
    }

    /// @dev A mistyped registry address, or one copied from the other chain's deployments file,
    ///      has no code. Without this check it deploys fine and every recordFill later reverts
    ///      with empty revert data.
    function test_Constructor_RejectsRegistryWithNoCode() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(makeAddr("not-a-registry"), runner);
    }

    /// @dev With the runner as a plain wallet, swapping the two arguments leaves a codeless address
    ///      in the registry slot, so it is caught at deploy. A swap between two contract addresses
    ///      is not caught here; the deploy script's read-backs of registry() and runner() cover it.
    function test_Constructor_RejectsSwappedArguments() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(runner, address(registry));
    }

    function test_Constructor_RejectsZeroRunner() public {
        vm.expectRevert(TrackRecord.ZeroRunner.selector);
        new TrackRecord(address(registry), address(0));
    }

    /// @dev PRD v2.2 Section 5.2 checks the registry first, so a deploy with both arguments wrong
    ///      reports the registry.
    function test_Constructor_ChecksRegistryBeforeRunner() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(address(0), address(0));
    }

    function testFuzz_Constructor_RejectsAnyRegistryWithNoCode(address candidate) public {
        vm.assume(candidate.code.length == 0);

        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(candidate, runner);
    }

    // ---------------------------------------------------------------------------------------------
    // a fresh ledger
    // ---------------------------------------------------------------------------------------------

    function test_FreshLedger_ReadsAsEmptyWithoutReverting() public view {
        assertEq(trackRecord.fillCount(), 0, "fresh ledger has fills");

        uint256[3] memory agentIds = [uint256(0), 1, type(uint256).max];
        for (uint256 i = 0; i < agentIds.length; i++) {
            assertEq(trackRecord.fillCountByAgent(agentIds[i]), 0, "fresh ledger has a per-agent fill");
        }

        ITrackRecord.Fill memory f = trackRecord.getFill(1);
        assertEq(f.fillId, 0, "an unrecorded fillId must read as fillId 0");
    }

    // ---------------------------------------------------------------------------------------------
    // errors shared with AgentRegistry
    // ---------------------------------------------------------------------------------------------

    /// @dev One ABI entry decodes AgentInactive from either contract.
    function test_AgentInactiveSharesItsSelectorWithAgentRegistry() public pure {
        assertEq(ITrackRecord.AgentInactive.selector, IAgentRegistry.AgentInactive.selector);
    }
}
