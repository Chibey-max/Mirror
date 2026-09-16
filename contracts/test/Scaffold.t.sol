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
        trackRecord = new TrackRecord(address(registry), RUNNER);
        policy = new PolicyModule(VAULT, ADMIN);
    }

    function test_ContractsDeploy() public view {
        assertEq(registry.agentCount(), 0, "fresh registry should hold no agents");
        assertEq(trackRecord.fillCount(), 0, "fresh ledger should hold no fills");
        assertEq(trackRecord.runner(), RUNNER);
        assertEq(address(trackRecord.registry()), address(registry));
        assertEq(policy.vault(), VAULT);
    }

    /// @dev Proves the @openzeppelin remapping resolves — PolicyModule extends OZ Ownable.
    function test_OpenZeppelinRemappingResolves() public view {
        assertEq(policy.owner(), ADMIN, "OZ Ownable not wired to admin");
    }

    function test_ConstructorsRejectZeroAddress() public {
        vm.expectRevert(TrackRecord.ZeroRunner.selector);
        new TrackRecord(address(registry), address(0));

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

    /// @dev EVENT SNAPSHOT — topic0 pins the canonical signature, but `indexed` is not part of
    ///      that signature. Dropping `indexed` from a parameter leaves topic0 identical while
    ///      moving the value out of the topics and into the data blob, so every indexer filtering
    ///      on it silently stops matching. Parameter names are absent from topic0 too.
    ///
    ///      So snapshot the full declaration out of the artifact: ordered types, the indexed flag,
    ///      parameter names, and whether the event is anonymous.
    function test_FrozenEventParameterSnapshot() public view {
        string memory registry = "out/AgentRegistry.sol/AgentRegistry.json";
        string memory record = "out/TrackRecord.sol/TrackRecord.json";
        string memory policyArtifact = "out/PolicyModule.sol/PolicyModule.json";

        assertEq(
            _abiSignature(registry, "event", "AgentRegistered"),
            "AgentRegistered(uint256 indexed agentId, address indexed owner, string name, bytes32 strategyHash) non-anonymous",
            "AgentRegistered declaration moved"
        );
        assertEq(
            _abiSignature(registry, "event", "AgentDeactivated"),
            "AgentDeactivated(uint256 indexed agentId) non-anonymous",
            "AgentDeactivated declaration moved"
        );
        assertEq(
            _abiSignature(record, "event", "FillRecorded"),
            "FillRecorded(uint256 indexed fillId, uint256 indexed agentId, address indexed token, bool isBuy, uint256 size, uint256 price, uint64 timestamp, bytes32 oracleRoundId) non-anonymous",
            "FillRecorded declaration moved"
        );
        assertEq(
            _abiSignature(policyArtifact, "event", "PolicySet"),
            "PolicySet(address indexed user, uint256 indexed agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps) non-anonymous",
            "PolicySet declaration moved"
        );
        assertEq(
            _abiSignature(policyArtifact, "event", "PolicyKilled"),
            "PolicyKilled(address indexed user, uint256 indexed agentId) non-anonymous",
            "PolicyKilled declaration moved"
        );
    }

    /// @dev ERROR SNAPSHOT — a selector covers argument types in order but not their names, so
    ///      swapping CapExceeded(uint256 attempted, uint256 cap) to (uint256 cap, uint256
    ///      attempted) leaves the selector identical and reverses the meaning. PolicyRejectBanner
    ///      renders those two numbers as "would move ${attempted}, cap is ${cap}", so that swap
    ///      ships a banner stating the reverse of what happened.
    function test_FrozenErrorParameterSnapshot() public view {
        string memory registry = "out/AgentRegistry.sol/AgentRegistry.json";
        string memory record = "out/TrackRecord.sol/TrackRecord.json";
        string memory policyArtifact = "out/PolicyModule.sol/PolicyModule.json";

        assertEq(_abiSignature(registry, "error", "NotAgentOwner"), "NotAgentOwner()", "NotAgentOwner moved");
        assertEq(_abiSignature(registry, "error", "EmptyName"), "EmptyName()", "EmptyName moved");
        assertEq(
            _abiSignature(registry, "error", "AgentInactive"), "AgentInactive(uint256 agentId)", "AgentInactive moved"
        );
        assertEq(_abiSignature(record, "error", "NotRunner"), "NotRunner()", "NotRunner moved");
        assertEq(_abiSignature(record, "error", "ZeroRunner"), "ZeroRunner()", "ZeroRunner moved");
        assertEq(_abiSignature(record, "error", "ZeroRegistry"), "ZeroRegistry()", "ZeroRegistry moved");
        assertEq(
            _abiSignature(record, "error", "AgentNotFound"), "AgentNotFound(uint256 agentId)", "AgentNotFound moved"
        );
        assertEq(
            _abiSignature(record, "error", "AgentInactive"), "AgentInactive(uint256 agentId)", "AgentInactive moved"
        );
        assertEq(_abiSignature(record, "error", "ZeroToken"), "ZeroToken()", "ZeroToken moved");
        assertEq(_abiSignature(record, "error", "ZeroSize"), "ZeroSize()", "ZeroSize moved");
        assertEq(_abiSignature(record, "error", "ZeroPrice"), "ZeroPrice()", "ZeroPrice moved");
        assertEq(
            _abiSignature(policyArtifact, "error", "CapExceeded"),
            "CapExceeded(uint256 attempted, uint256 cap)",
            "CapExceeded moved - PolicyRejectBanner renders these two in this order"
        );
        assertEq(
            _abiSignature(policyArtifact, "error", "TokenNotAllowed"),
            "TokenNotAllowed(address token)",
            "TokenNotAllowed moved"
        );
        assertEq(_abiSignature(policyArtifact, "error", "PolicyInactive"), "PolicyInactive()", "PolicyInactive moved");
        assertEq(_abiSignature(policyArtifact, "error", "OnlyVault"), "OnlyVault()", "OnlyVault moved");
    }

    /// @dev Rebuilds an event or error declaration from a compiled artifact as
    ///      `Name(type[ indexed] name, ...)`, with ` anonymous` / ` non-anonymous` appended for
    ///      events. Walks inputs by index until one is missing, so an added or removed parameter
    ///      changes the result.
    function _abiSignature(string memory artifact, string memory entryType, string memory entryName)
        internal
        view
        returns (string memory out)
    {
        string memory json = vm.readFile(artifact);
        string memory base = string.concat("$.abi[?(@.name=='", entryName, "' && @.type=='", entryType, "')]");

        // Without this guard a missing entry yields "Name()", which a no-argument error would
        // match exactly — a rename would pass silently.
        try vm.parseJsonString(json, string.concat(base, ".type")) returns (string memory foundType) {
            require(
                keccak256(bytes(foundType)) == keccak256(bytes(entryType)),
                string.concat("ABI entry type mismatch for ", entryName)
            );
        } catch {
            revert(string.concat("ABI entry not found: ", entryType, " ", entryName));
        }

        out = string.concat(entryName, "(");

        for (uint256 i = 0; i < 64; i++) {
            string memory at = string.concat(base, ".inputs[", vm.toString(i), "]");
            try vm.parseJsonString(json, string.concat(at, ".type")) returns (string memory paramType) {
                string memory paramName = vm.parseJsonString(json, string.concat(at, ".name"));

                string memory indexedFlag = "";
                try vm.parseJsonBool(json, string.concat(at, ".indexed")) returns (bool isIndexed) {
                    indexedFlag = isIndexed ? " indexed" : "";
                } catch {}

                out = string.concat(out, i == 0 ? "" : ", ", paramType, indexedFlag, " ", paramName);
            } catch {
                break;
            }
        }

        out = string.concat(out, ")");

        try vm.parseJsonBool(json, string.concat(base, ".anonymous")) returns (bool isAnonymous) {
            out = string.concat(out, isAnonymous ? " anonymous" : " non-anonymous");
        } catch {}
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
        assertEq(
            IAgentRegistry.AgentInactive.selector,
            bytes4(keccak256("AgentInactive(uint256)")),
            "AgentInactive signature moved"
        );
        assertEq(ITrackRecord.NotRunner.selector, bytes4(keccak256("NotRunner()")), "NotRunner signature moved");
        assertEq(TrackRecord.ZeroRunner.selector, bytes4(keccak256("ZeroRunner()")), "ZeroRunner signature moved");
        assertEq(TrackRecord.ZeroRegistry.selector, bytes4(keccak256("ZeroRegistry()")), "ZeroRegistry signature moved");
        assertEq(
            ITrackRecord.AgentNotFound.selector,
            bytes4(keccak256("AgentNotFound(uint256)")),
            "AgentNotFound signature moved"
        );
        assertEq(
            ITrackRecord.AgentInactive.selector,
            bytes4(keccak256("AgentInactive(uint256)")),
            "AgentInactive signature moved"
        );
        assertEq(ITrackRecord.ZeroToken.selector, bytes4(keccak256("ZeroToken()")), "ZeroToken signature moved");
        assertEq(ITrackRecord.ZeroSize.selector, bytes4(keccak256("ZeroSize()")), "ZeroSize signature moved");
        assertEq(ITrackRecord.ZeroPrice.selector, bytes4(keccak256("ZeroPrice()")), "ZeroPrice signature moved");
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
