// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";

/// @dev Exists only so test_FrozenStructShapes has a selector to read. Solidity flattens a
///      struct parameter to its canonical tuple when computing a selector, which makes these
///      three selectors an exact fingerprint of the three struct layouts. Never called.
interface IFreezeProbe {
    function agent(IAgentRegistry.Agent calldata a) external;
    function fill(ITrackRecord.Fill calldata f) external;
    function policy(IPolicyModule.Policy calldata p) external;
}

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

    /// @dev ABI FREEZE — locks the canonical shape of every PRD Section 4 struct, event and
    ///      custom error on the three contracts Isaac owns.
    ///
    ///      A struct's canonical tuple is baked into the 4-byte selector of any function that
    ///      takes it as a parameter, and an event's canonical signature is its topic0, so both
    ///      can be pinned exactly by comparing against a frozen signature string. Reordering a
    ///      field, renaming it, or changing its width all change that string, and the assertion
    ///      names the frozen form it expected.
    ///
    /// @dev An earlier version built each struct with a named literal and zero values. That
    ///      cannot enforce a freeze: named arguments are order-independent, so reordering fields
    ///      still compiles, and an untyped `0` fits any integer width, so narrowing uint256 to
    ///      uint128 still compiles. Both are breaking ABI changes and both passed.
    ///
    ///      If one of these fails, the ABI moved. That is a whole-team sync, not a test edit.
    function test_FrozenStructShapes() public pure {
        assertEq(
            IFreezeProbe.agent.selector,
            bytes4(keccak256("agent((address,string,bytes32,string,uint64,bool))")),
            "IAgentRegistry.Agent shape moved - expected (address,string,bytes32,string,uint64,bool)"
        );

        assertEq(
            IFreezeProbe.fill.selector,
            bytes4(keccak256("fill((uint256,uint256,address,bool,uint256,uint256,uint64,bytes32))")),
            "ITrackRecord.Fill shape moved - expected (uint256,uint256,address,bool,uint256,uint256,uint64,bytes32)"
        );

        assertEq(
            IFreezeProbe.policy.selector,
            bytes4(keccak256("policy((uint256,uint256,bool))")),
            "IPolicyModule.Policy shape moved - expected (uint256,uint256,bool)"
        );
    }

    /// @dev ABI SNAPSHOT — the canonical tuple above pins what the EVM decodes, but it cannot
    ///      see two things that still break a client: reordering two fields of the SAME type
    ///      (the tuple is unchanged) and renaming a field (names are not part of a selector).
    ///      Swapping Policy.maxNotionalPerDay with Policy.maxSlippageBps is the dangerous case —
    ///      identical `(uint256,uint256,bool)` tuple, inverted meaning, so the frontend would
    ///      write a slippage value into the daily notional cap.
    ///
    ///      This reads the field list straight out of the freshly compiled artifact, names
    ///      included, and compares it to the frozen snapshot. Every reorder, rename, retype,
    ///      addition and removal changes the string, and the failure prints both sides.
    function test_FrozenStructFieldSnapshot() public view {
        assertEq(
            _fieldSnapshot("out/AgentRegistry.sol/AgentRegistry.json", "getAgent"),
            "address owner, string name, bytes32 strategyHash, string modelVersion, uint64 registeredAt, bool active",
            "IAgentRegistry.Agent field snapshot moved"
        );

        assertEq(
            _fieldSnapshot("out/TrackRecord.sol/TrackRecord.json", "getFill"),
            "uint256 fillId, uint256 agentId, address token, bool isBuy, uint256 size, uint256 price, uint64 timestamp, bytes32 oracleRoundId",
            "ITrackRecord.Fill field snapshot moved"
        );

        assertEq(
            _fieldSnapshot("out/PolicyModule.sol/PolicyModule.json", "getPolicy"),
            "uint256 maxNotionalPerDay, uint256 maxSlippageBps, bool active",
            "IPolicyModule.Policy field snapshot moved"
        );
    }

    /// @dev Reads `<getter>`'s returned tuple out of a compiled artifact as "type name" pairs in
    ///      declaration order. Walks the components until one is missing, so an added or removed
    ///      field changes the result rather than being skipped by a hardcoded count.
    function _fieldSnapshot(string memory artifact, string memory getter) internal view returns (string memory out) {
        string memory json = vm.readFile(artifact);
        string memory base = string.concat("$.abi[?(@.name=='", getter, "')].outputs[0].components");

        for (uint256 i = 0; i < 64; i++) {
            string memory at = string.concat(base, "[", vm.toString(i), "]");
            try vm.parseJsonString(json, string.concat(at, ".type")) returns (string memory fieldType) {
                string memory fieldName = vm.parseJsonString(json, string.concat(at, ".name"));
                out = i == 0
                    ? string.concat(fieldType, " ", fieldName)
                    : string.concat(out, ", ", fieldType, " ", fieldName);
            } catch {
                break;
            }
        }

        require(bytes(out).length > 0, "ABI snapshot: no components found - was the getter renamed?");
    }

    /// @dev topic0 is the hash of the event's canonical signature, so this pins argument order
    ///      and types. The indexer reads FillRecorded off the logs (PRD Section 5.2); a moved
    ///      topic0 makes every historical log undecodable by the new client.
    function test_FrozenEventShapes() public pure {
        assertEq(
            IAgentRegistry.AgentRegistered.selector,
            keccak256("AgentRegistered(uint256,address,string,bytes32)"),
            "AgentRegistered signature moved"
        );
        assertEq(
            IAgentRegistry.AgentDeactivated.selector,
            keccak256("AgentDeactivated(uint256)"),
            "AgentDeactivated signature moved"
        );
        assertEq(
            ITrackRecord.FillRecorded.selector,
            keccak256("FillRecorded(uint256,uint256,address,bool,uint256,uint256,uint64,bytes32)"),
            "FillRecorded signature moved"
        );
        assertEq(
            IPolicyModule.PolicySet.selector,
            keccak256("PolicySet(address,uint256,uint256,uint256)"),
            "PolicySet signature moved"
        );
        assertEq(
            IPolicyModule.PolicyKilled.selector,
            keccak256("PolicyKilled(address,uint256)"),
            "PolicyKilled signature moved"
        );
    }

    /// @dev The custom errors are load-bearing for the frontend: Patrick decodes them with viem
    ///      and renders the exact copy in PRD Section 4.6 (see the note at IPolicyModule.sol:6).
    ///      A renamed error or a reordered argument list silently breaks that decode, so the
    ///      selectors are frozen here alongside the structs.
    function test_FrozenErrorShapes() public pure {
        assertEq(
            IAgentRegistry.NotAgentOwner.selector, bytes4(keccak256("NotAgentOwner()")), "NotAgentOwner signature moved"
        );
        assertEq(IAgentRegistry.EmptyName.selector, bytes4(keccak256("EmptyName()")), "EmptyName signature moved");
        assertEq(ITrackRecord.NotRunner.selector, bytes4(keccak256("NotRunner()")), "NotRunner signature moved");
        assertEq(
            IPolicyModule.CapExceeded.selector,
            bytes4(keccak256("CapExceeded(uint256,uint256)")),
            "CapExceeded signature moved - PolicyRejectBanner decodes (attempted, cap) in this order"
        );
        assertEq(
            IPolicyModule.TokenNotAllowed.selector,
            bytes4(keccak256("TokenNotAllowed(address)")),
            "TokenNotAllowed signature moved"
        );
        assertEq(
            IPolicyModule.PolicyInactive.selector,
            bytes4(keccak256("PolicyInactive()")),
            "PolicyInactive signature moved"
        );
        assertEq(IPolicyModule.OnlyVault.selector, bytes4(keccak256("OnlyVault()")), "OnlyVault signature moved");
    }
}
