// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";

/// @title ScaffoldTest
/// @notice Toolchain smoke test — proves the Foundry workspace, remappings, OpenZeppelin
///         import path, and all three stubs deploy and answer view calls. Not a logic test.
contract ScaffoldTest is Test {
    AgentRegistry internal registry;
    TrackRecord internal trackRecord;
    PolicyModule internal policy;

    address internal constant RUNNER = address(0xA11CE);
    address internal constant VAULT = address(0xBEEF);
    address internal constant ADMIN = address(0xADA);

    function setUp() public {
        registry = new AgentRegistry();
        trackRecord = new TrackRecord(RUNNER);
        policy = new PolicyModule(VAULT, ADMIN);
    }

    function test_ContractsDeploy() public view {
        assertEq(registry.agentCount(), 0, "fresh registry should hold no agents");
        assertEq(trackRecord.fillCount(), 0, "fresh ledger should hold no fills");
        assertEq(trackRecord.runner(), RUNNER);
        assertEq(policy.vault(), VAULT);
    }

    /// @dev Proves the @openzeppelin remapping resolves — PolicyModule extends OZ Ownable.
    function test_OpenZeppelinRemappingResolves() public view {
        assertEq(policy.owner(), ADMIN, "OZ Ownable not wired to admin");
    }

    function test_ConstructorsRejectZeroAddress() public {
        vm.expectRevert(TrackRecord.ZeroRunner.selector);
        new TrackRecord(address(0));

        vm.expectRevert(PolicyModule.ZeroVault.selector);
        new PolicyModule(address(0), ADMIN);
    }

    /// @dev Locks the Section 4 struct shapes. If a field is added, reordered, or retyped after
    ///      the Day-3 freeze, this stops compiling — which is the intended alarm.
    function test_FrozenStructShapes() public pure {
        IAgentRegistry.Agent memory a = IAgentRegistry.Agent({
            owner: address(0), name: "", strategyHash: bytes32(0), modelVersion: "", registeredAt: 0, active: false
        });

        ITrackRecord.Fill memory f = ITrackRecord.Fill({
            fillId: 0,
            agentId: 0,
            token: address(0),
            isBuy: false,
            size: 0,
            price: 0,
            timestamp: 0,
            oracleRoundId: bytes32(0)
        });

        IPolicyModule.Policy memory p = IPolicyModule.Policy({maxNotionalPerDay: 0, maxSlippageBps: 0, active: false});

        assertEq(a.registeredAt, 0);
        assertEq(f.fillId, 0);
        assertEq(p.maxNotionalPerDay, 0);
    }
}
