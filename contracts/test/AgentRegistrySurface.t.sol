// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

/// @title AgentRegistrySurfaceTest
/// @notice Locks AgentRegistry's external surface. Owner: Isaac.
///
/// @dev Two of AgentRegistry's guarantees are enforced by OMISSION, the same way TrackRecord's
///      append-only guarantee is:
///        - identity is permanent: nothing can rewrite owner, name, strategyHash, modelVersion or
///          registeredAt once registered;
///        - deactivation is one-way: nothing can set an agent back to active.
///      A missing function cannot be tested by calling it, so these tests assert on the compiled
///      artifact instead — the same technique, and for the same reasons, as AppendOnly.t.sol.
///
/// @dev If test_DispatchTableIsExactlyTheFrozenSurface fails, a function was added. Do not "fix" it
///      by widening the allowlist — that is an ABI change and needs a whole-team sync.
contract AgentRegistrySurfaceTest is Test {
    AgentRegistry internal registry;

    /// @dev Path is relative to the Foundry root; `fs_permissions` grants read on ./out.
    string internal constant ARTIFACT = "out/AgentRegistry.sol/AgentRegistry.json";

    function setUp() public {
        registry = new AgentRegistry();
    }

    /// @dev Every externally callable function on AgentRegistry, as canonical signatures.
    function _dispatchTable() internal view returns (string[] memory) {
        return vm.parseJsonKeys(vm.readFile(ARTIFACT), ".methodIdentifiers");
    }

    /// @dev The complete external surface per PRD v2.1 Section 5.1.
    function _frozenSurface() internal pure returns (string[] memory frozen) {
        frozen = new string[](4);
        frozen[0] = "registerAgent(string,bytes32,string)";
        frozen[1] = "deactivateAgent(uint256)";
        frozen[2] = "getAgent(uint256)";
        frozen[3] = "agentCount()";
    }

    /// @dev ALLOWLIST — the load-bearing assertion. Any added function, under any name, arity or
    ///      mutability, appears in the dispatch table and fails here.
    function test_DispatchTableIsExactlyTheFrozenSurface() public view {
        string[] memory actual = _dispatchTable();
        string[] memory frozen = _frozenSurface();

        for (uint256 i = 0; i < actual.length; i++) {
            assertTrue(
                _contains(frozen, actual[i]),
                string.concat("UNFROZEN function is dispatchable on AgentRegistry: ", actual[i])
            );
        }

        for (uint256 i = 0; i < frozen.length; i++) {
            assertTrue(_contains(actual, frozen[i]), string.concat("frozen function went missing: ", frozen[i]));
        }

        assertEq(actual.length, frozen.length, "AgentRegistry's external surface changed size");
    }

    /// @dev DENYLIST — redundant against the allowlist, kept because the failure names the offending
    ///      path outright. Matched on function NAME, so it catches the path whatever its arguments.
    function test_NoIdentityMutationOrReactivationIsDispatchable() public view {
        string[16] memory forbidden = [
            "setAgent",
            "updateAgent",
            "editAgent",
            "setName",
            "setStrategyHash",
            "setModelVersion",
            "setOwner",
            "transferAgent",
            "transferOwnership",
            "reactivateAgent",
            "activateAgent",
            "setActive",
            "deleteAgent",
            "removeAgent",
            "renounceOwnership",
            "upgradeTo"
        ];

        string[] memory actual = _dispatchTable();

        for (uint256 i = 0; i < forbidden.length; i++) {
            for (uint256 j = 0; j < actual.length; j++) {
                assertFalse(
                    _startsWith(actual[j], string.concat(forbidden[i], "(")),
                    string.concat("FORBIDDEN identity mutation path is dispatchable: ", actual[j])
                );
            }
        }
    }

    /// @dev A fallback has no selector, so the allowlist above cannot see it, and a gated one would
    ///      still revert on an empty call. The ABI declares fallback and receive as their own entry
    ///      types, so assert there.
    function test_AbiDeclaresNoFallbackOrReceive() public view {
        string[] memory entryTypes = _abiEntryTypes();
        assertGt(entryTypes.length, 0, "ABI walk returned nothing - is the artifact path right?");

        for (uint256 i = 0; i < entryTypes.length; i++) {
            assertFalse(_eq(entryTypes[i], "fallback"), "FORBIDDEN: AgentRegistry declares a fallback");
            assertFalse(_eq(entryTypes[i], "receive"), "FORBIDDEN: AgentRegistry declares a receive function");
        }
    }

    /// @dev No function is payable, so ETH can never be sent in through a normal call and get stuck.
    function test_NoFunctionIsPayable() public view {
        string memory json = vm.readFile(ARTIFACT);
        uint256 checked;

        for (uint256 i = 0; i < 256; i++) {
            string memory at = string.concat("$.abi[", vm.toString(i), "]");
            try vm.parseJsonString(json, string.concat(at, ".type")) returns (string memory entryType) {
                if (!_eq(entryType, "function")) continue;
                string memory mutability = vm.parseJsonString(json, string.concat(at, ".stateMutability"));
                assertFalse(_eq(mutability, "payable"), "FORBIDDEN: AgentRegistry has a payable function");
                checked++;
            } catch {
                break;
            }
        }

        assertEq(checked, 4, "expected to inspect exactly the 4 frozen functions");
    }

    /// @dev Behavioural corroboration of the two ABI checks above: a bare call finds nothing to
    ///      dispatch to, and ETH sent with a call is refused.
    function test_BareCallsAndEthTransfersAreRefused() public {
        (bool okEmpty,) = address(registry).call("");
        assertFalse(okEmpty, "AgentRegistry accepts bare calls");

        vm.deal(address(this), 1 ether);
        (bool okValue,) = address(registry).call{value: 1 wei}("");
        assertFalse(okValue, "AgentRegistry accepted ETH");

        (bool okPayableRegister,) = address(registry).call{value: 1 wei}(
            abi.encodeCall(AgentRegistry.registerAgent, ("Pulse", keccak256("pulse-strategy"), "pulse-v1.2"))
        );
        assertFalse(okPayableRegister, "registerAgent accepted ETH");
        assertEq(address(registry).balance, 0);
    }

    /// @dev Every entry type in the artifact's ABI array, in order. Walks by index until one is
    ///      missing, so `fallback` and `receive` — absent from methodIdentifiers — are still visible.
    function _abiEntryTypes() internal view returns (string[] memory entryTypes) {
        string memory json = vm.readFile(ARTIFACT);
        string[] memory buffer = new string[](256);
        uint256 count;

        for (uint256 i = 0; i < 256; i++) {
            try vm.parseJsonString(json, string.concat("$.abi[", vm.toString(i), "].type")) returns (
                string memory entryType
            ) {
                buffer[count++] = entryType;
            } catch {
                break;
            }
        }

        entryTypes = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            entryTypes[i] = buffer[i];
        }
    }

    function _eq(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function _contains(string[] memory haystack, string memory needle) internal pure returns (bool) {
        bytes32 target = keccak256(bytes(needle));
        for (uint256 i = 0; i < haystack.length; i++) {
            if (keccak256(bytes(haystack[i])) == target) return true;
        }
        return false;
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory b = bytes(s);
        bytes memory p = bytes(prefix);
        if (p.length > b.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (b[i] != p[i]) return false;
        }
        return true;
    }
}
