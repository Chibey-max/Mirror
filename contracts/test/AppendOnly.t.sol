// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";

/// @title AppendOnlyTest
/// @notice PRD Section 7, required test #1 — append-only enforcement. Accountable: Isaac.
///
/// @dev This test is the executable form of the product's first claim: TrackRecord exposes no
///      path that can mutate a recorded Fill (PRD Section 1.4). The guarantee is enforced by
///      OMISSION, so the test asserts on the compiled dispatch table rather than on call
///      outcomes: it reads `methodIdentifiers` from the freshly-compiled artifact, which lists
///      every externally callable function with its selector. A function that exists is in that
///      table regardless of its name, arity, or mutability, so there is nowhere for a mutation
///      path to hide.
///
/// @dev An earlier version of this file probed forbidden signatures with `staticcall` and
///      asserted the call failed. That could not work: `staticcall` rejects any state write, and
///      the multi-argument signatures were passed a single argument, so the calls failed on the
///      static-context and calldata-decode checks before dispatch was ever reached. A live
///      `editFill` passed all three tests. Assert on the ABI, never on a call that has more than
///      one reason to fail.
///
/// @dev If someone adds a mutation function, test_DispatchTableIsExactlyTheFrozenSurface goes
///      red. Do not "fix" it by widening the allowlist. Delete the function.
contract AppendOnlyTest is Test {
    TrackRecord internal trackRecord;

    address internal constant RUNNER = address(0xA11CE);

    /// @dev Path is relative to the Foundry root; `fs_permissions` grants read on ./out.
    string internal constant ARTIFACT = "out/TrackRecord.sol/TrackRecord.json";

    function setUp() public {
        trackRecord = new TrackRecord(RUNNER);
    }

    /// @dev Every externally callable function on TrackRecord, as canonical signatures.
    function _dispatchTable() internal view returns (string[] memory) {
        return vm.parseJsonKeys(vm.readFile(ARTIFACT), ".methodIdentifiers");
    }

    /// @dev The complete external surface of TrackRecord per PRD Section 4.2. Adding an entry
    ///      here is an ABI change and needs a whole-team sync, not a test edit.
    function _frozenSurface() internal pure returns (string[] memory frozen) {
        frozen = new string[](5);
        frozen[0] = "recordFill(uint256,address,bool,uint256,uint256,bytes32)";
        frozen[1] = "getFill(uint256)";
        frozen[2] = "getFillsByAgent(uint256,uint256,uint256)";
        frozen[3] = "fillCount()";
        frozen[4] = "runner()";
    }

    /// @dev ALLOWLIST — the load-bearing assertion. Any function added under any name, with any
    ///      arity and any mutability, appears in the dispatch table and fails this test. This is
    ///      what makes "enforced by omission" mechanically checkable.
    function test_DispatchTableIsExactlyTheFrozenSurface() public view {
        string[] memory actual = _dispatchTable();
        string[] memory frozen = _frozenSurface();

        for (uint256 i = 0; i < actual.length; i++) {
            assertTrue(
                _contains(frozen, actual[i]),
                string.concat("UNFROZEN function is dispatchable on TrackRecord: ", actual[i])
            );
        }

        for (uint256 i = 0; i < frozen.length; i++) {
            assertTrue(_contains(actual, frozen[i]), string.concat("frozen function went missing: ", frozen[i]));
        }

        assertEq(actual.length, frozen.length, "TrackRecord's external surface changed size");
    }

    /// @dev DENYLIST — redundant against the allowlist above, kept because the failure message
    ///      names the offending mutation path outright. Matched on function NAME, so it catches
    ///      the path whatever arguments it is given.
    function test_NoForbiddenMutationNameIsDispatchable() public view {
        string[10] memory forbidden = [
            "editFill",
            "deleteFill",
            "setFill",
            "updateFill",
            "amendFill",
            "removeFill",
            "correctFill",
            "adminSetFill",
            "setRunner",
            "upgradeTo"
        ];

        string[] memory actual = _dispatchTable();

        for (uint256 i = 0; i < forbidden.length; i++) {
            for (uint256 j = 0; j < actual.length; j++) {
                assertFalse(
                    _startsWith(actual[j], string.concat(forbidden[i], "(")),
                    string.concat("FORBIDDEN mutation path is dispatchable: ", actual[j])
                );
            }
        }
    }

    /// @dev A bare call with no calldata must find nothing — proves there is no fallback or
    ///      receive that could be grown into a mutation path later. Unlike a selector probe this
    ///      has exactly one reason to fail, so the assertion is sound.
    function test_NoFallbackExists() public {
        (bool ok,) = address(trackRecord).call("");
        assertFalse(ok, "TrackRecord accepts bare calls - a fallback could hide a mutation path");
    }

    /// @dev The runner is the only writer and is immutable by design; rotating it would weaken
    ///      the append-only story. `runner` is `immutable`, so no setter can exist — the absence
    ///      of setRunner from the dispatch table is asserted above.
    function test_RunnerIsSetOnceFromConstructor() public view {
        assertEq(trackRecord.runner(), RUNNER, "runner not set from constructor");
    }

    /// @dev BEHAVIORAL — the complement to the ABI assertions: proves a recorded Fill's bytes do
    ///      not change when every forbidden path is invoked with correctly encoded, full-arity
    ///      calldata over a state-changing `call`.
    ///
    ///      Skipped until Day 4 (Sun 14 Sep): `recordFill` reverts NotImplemented, so no Fill can
    ///      be recorded to mutate. Remove the vm.skip line when the body lands. The allowlist
    ///      test above is live in the meantime and is the stronger of the two.
    function test_RecordedFillCannotBeMutated() public {
        vm.skip(true);

        vm.prank(RUNNER);
        uint256 fillId = trackRecord.recordFill(1, address(0xC0FFEE), true, 1000, 2_500_000_000, bytes32("round-1"));

        ITrackRecord.Fill memory before = trackRecord.getFill(fillId);
        uint256 countBefore = trackRecord.fillCount();

        bytes[] memory attempts = new bytes[](4);
        attempts[0] = abi.encodeWithSignature(
            "editFill(uint256,uint256,address,bool,uint256,uint256,bytes32)",
            fillId,
            uint256(99),
            address(0xBAD),
            false,
            uint256(1),
            uint256(1),
            bytes32("tampered")
        );
        attempts[1] = abi.encodeWithSignature("deleteFill(uint256)", fillId);
        attempts[2] = abi.encodeWithSignature(
            "setFill(uint256,uint256,address,bool,uint256,uint256,bytes32)",
            fillId,
            uint256(99),
            address(0xBAD),
            false,
            uint256(1),
            uint256(1),
            bytes32("tampered")
        );
        attempts[3] = abi.encodeWithSignature("setRunner(address)", address(this));

        for (uint256 i = 0; i < attempts.length; i++) {
            (bool ok,) = address(trackRecord).call(attempts[i]);
            assertFalse(ok, "a forbidden mutation call succeeded");
        }

        ITrackRecord.Fill memory persisted = trackRecord.getFill(fillId);
        assertEq(keccak256(abi.encode(persisted)), keccak256(abi.encode(before)), "recorded Fill was mutated");
        assertEq(trackRecord.fillCount(), countBefore, "fillCount moved");
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
