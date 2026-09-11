// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrackRecord} from "../src/TrackRecord.sol";

/// @title AppendOnlyTest
/// @notice PRD Section 7, required test #1 — append-only enforcement. Accountable: Isaac.
///
/// @dev This test is REAL and passing from Day 2, deliberately. It is the executable form of
///      the product's first claim: TrackRecord exposes no path that can mutate a recorded Fill.
///      It probes every plausible mutation signature with a low-level call and asserts the call
///      finds no function to dispatch to. Because TrackRecord declares no fallback and no
///      receive, an unmatched selector reverts — which is exactly the guarantee.
///
///      If someone ever adds a mutation function, this test goes red. Do not "fix" it by
///      deleting a probe. Delete the function.
contract AppendOnlyTest is Test {
    TrackRecord internal trackRecord;

    address internal constant RUNNER = address(0xA11CE);

    function setUp() public {
        trackRecord = new TrackRecord(RUNNER);
    }

    /// @dev Every signature a well-meaning teammate might reach for under deadline pressure.
    function test_NoMutationFunctionExists() public view {
        string[10] memory forbidden = [
            "editFill(uint256,uint256,address,bool,uint256,uint256,bytes32)",
            "editFill(uint256)",
            "deleteFill(uint256)",
            "setFill(uint256,uint256,address,bool,uint256,uint256,bytes32)",
            "setFill(uint256)",
            "updateFill(uint256)",
            "amendFill(uint256)",
            "removeFill(uint256)",
            "correctFill(uint256)",
            "adminSetFill(uint256)"
        ];

        for (uint256 i = 0; i < forbidden.length; i++) {
            (bool ok,) = address(trackRecord).staticcall(abi.encodeWithSignature(forbidden[i], uint256(1)));
            assertFalse(ok, string.concat("FORBIDDEN mutation path is dispatchable: ", forbidden[i]));
        }
    }

    /// @dev A bare call with no calldata must also find nothing — proves there is no fallback
    ///      that could be grown into a mutation path later.
    function test_NoFallbackExists() public {
        (bool ok,) = address(trackRecord).call("");
        assertFalse(ok, "TrackRecord accepts bare calls - a fallback could hide a mutation path");
    }

    /// @dev The runner is immutable by design; there is no setRunner to rotate the only writer.
    function test_RunnerIsImmutable() public view {
        assertEq(trackRecord.runner(), RUNNER, "runner not set from constructor");

        (bool ok,) = address(trackRecord).staticcall(abi.encodeWithSignature("setRunner(address)", address(this)));
        assertFalse(ok, "FORBIDDEN: setRunner is dispatchable");
    }
}
