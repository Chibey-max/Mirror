// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// @title AgentRegistryHandler
/// @notice Drives random registerAgent / deactivateAgent sequences from a small pool of actors and
///         keeps a ghost model of what the registry should contain.
///
/// @dev Every call's outcome is compared against the model INSIDE the handler, and a disagreement is
///      recorded in `unexpectedOutcomes` rather than asserted. With fail_on_revert off, an assertion
///      that reverts inside a handler call is silently discarded, so the count is checked by an
///      invariant instead.
contract AgentRegistryHandler is Test {
    struct Registered {
        address owner;
        bytes32 nameHash;
        bytes32 strategyHash;
        bytes32 modelVersionHash;
        uint64 registeredAt;
        bool active;
    }

    AgentRegistry public immutable registry;

    address[] internal _actors;
    mapping(uint256 => Registered) internal _model;

    uint256 public modelCount;
    uint256 public unexpectedOutcomes;

    constructor(AgentRegistry registry_) {
        registry = registry_;
        for (uint256 i = 0; i < 4; i++) {
            _actors.push(address(uint160(0xA6E0 + i)));
        }
    }

    function registered(uint256 agentId) external view returns (Registered memory) {
        return _model[agentId];
    }

    function registerAgent(
        uint256 actorSeed,
        string calldata name,
        bytes32 strategyHash,
        string calldata modelVersion,
        uint32 secondsLater
    ) external {
        address actor = _actors[actorSeed % _actors.length];
        vm.warp(block.timestamp + secondsLater);

        vm.prank(actor);
        try registry.registerAgent(name, strategyHash, modelVersion) returns (uint256 agentId) {
            if (bytes(name).length == 0 || agentId != modelCount + 1) unexpectedOutcomes++;

            modelCount = agentId;
            _model[agentId] = Registered({
                owner: actor,
                nameHash: keccak256(bytes(name)),
                strategyHash: strategyHash,
                modelVersionHash: keccak256(bytes(modelVersion)),
                registeredAt: uint64(block.timestamp),
                active: true
            });
        } catch (bytes memory reason) {
            bool expected = bytes(name).length == 0 && bytes4(reason) == IAgentRegistry.EmptyName.selector;
            if (!expected) unexpectedOutcomes++;
        }
    }

    /// @dev Targets ids 0..modelCount+1, so id 0 and the first unregistered id are both exercised.
    ///      `asOwner` routes roughly half the calls through the real owner so the success path and
    ///      the AgentInactive path are reached, not just NotAgentOwner.
    function deactivateAgent(uint256 actorSeed, uint256 agentIdSeed, bool asOwner) external {
        uint256 agentId = agentIdSeed % (modelCount + 2);
        Registered storage agent = _model[agentId];

        address actor = asOwner && agent.owner != address(0) ? agent.owner : _actors[actorSeed % _actors.length];

        bytes memory expectedRevert;
        if (agent.owner != actor) {
            expectedRevert = abi.encodeWithSelector(IAgentRegistry.NotAgentOwner.selector);
        } else if (!agent.active) {
            expectedRevert = abi.encodeWithSelector(IAgentRegistry.AgentInactive.selector, agentId);
        }

        vm.prank(actor);
        try registry.deactivateAgent(agentId) {
            if (expectedRevert.length != 0) unexpectedOutcomes++;
            agent.active = false;
        } catch (bytes memory reason) {
            if (keccak256(reason) != keccak256(expectedRevert) || expectedRevert.length == 0) unexpectedOutcomes++;
        }
    }
}

/// @title AgentRegistryInvariantTest
/// @notice Properties that must hold after ANY sequence of registrations and deactivations, by anyone.
///
/// @dev Campaigns are capped at 128 runs x 64 calls. invariant_RegisteredAgentsMatchTheirRegistration
///      walks every registered agent after every call, so cost grows with depth squared; Foundry's
///      default of 256 x 500 took over ten minutes for no additional coverage of a two-function contract.
contract AgentRegistryInvariantTest is Test {
    AgentRegistry internal registry;
    AgentRegistryHandler internal handler;

    function setUp() public {
        registry = new AgentRegistry();
        handler = new AgentRegistryHandler(registry);
        vm.warp(1_789_000_000);

        bytes4[] memory selectors = new bytes4[](2);
        selectors[0] = AgentRegistryHandler.registerAgent.selector;
        selectors[1] = AgentRegistryHandler.deactivateAgent.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev Every call succeeded or reverted exactly as the model predicted — including that no
    ///      non-owner ever deactivated an agent and no second deactivation ever succeeded.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_EveryCallMatchesTheModel() public view {
        assertEq(handler.unexpectedOutcomes(), 0, "a call's outcome disagreed with the model");
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_AgentCountEqualsSuccessfulRegistrations() public view {
        assertEq(registry.agentCount(), handler.modelCount());
    }

    /// @dev Identity is permanent and `active` only ever moves true -> false: each registered agent's
    ///      five identity fields still equal what was registered, and its active flag equals the
    ///      model's, which is set true once at registration and only ever set false.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_RegisteredAgentsMatchTheirRegistration() public view {
        uint256 count = registry.agentCount();
        for (uint256 agentId = 1; agentId <= count; agentId++) {
            IAgentRegistry.Agent memory actual = registry.getAgent(agentId);
            AgentRegistryHandler.Registered memory expected = handler.registered(agentId);

            assertTrue(actual.owner != address(0), "a registered id has no owner");
            assertEq(actual.owner, expected.owner, "owner changed");
            assertEq(keccak256(bytes(actual.name)), expected.nameHash, "name changed");
            assertEq(actual.strategyHash, expected.strategyHash, "strategyHash changed");
            assertEq(keccak256(bytes(actual.modelVersion)), expected.modelVersionHash, "modelVersion changed");
            assertEq(actual.registeredAt, expected.registeredAt, "registeredAt changed");
            assertEq(actual.active, expected.active, "active diverged from the one-way model");
        }
    }

    /// @dev Id 0 and every id past agentCount read as the zero struct — the lookup TrackRecord's
    ///      AgentNotFound check depends on.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_UnregisteredIdsDoNotExist() public view {
        assertEq(registry.getAgent(0).owner, address(0), "id 0 exists");
        assertEq(registry.getAgent(registry.agentCount() + 1).owner, address(0), "an id past agentCount exists");
    }
}
