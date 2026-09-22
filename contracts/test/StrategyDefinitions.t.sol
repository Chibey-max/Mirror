// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

/// @notice Locks AgentRegistry's strategy commitments to the exact committed definition bytes.
contract StrategyDefinitionsTest is Test {
    bytes32 internal constant PULSE_HASH = 0x8d32353838e901b918e9d1fb1d50c19fe0ac35a9dbe82da1b3c755033c91d0c3;
    bytes32 internal constant RED_HASH = 0xacbf6fccaf5e4c5dad8c8cc2d66c13cd3cfe57b9070cea12262b2d09efe869f9;
    bytes32 internal constant DRIFT_HASH = 0xe394056ed936fd2705b87058e1c331ba6fac94d5e090505f3753bfbc096aa573;

    function test_StrategyDefinitionsMatchRegistrationCommitments() public view {
        _assertStrategy("pulse.json", "Pulse", "pulse-v1.2", PULSE_HASH);
        _assertStrategy("red.json", "Red", "red-v1.0", RED_HASH);
        _assertStrategy("drift.json", "Drift", "drift-v1.0", DRIFT_HASH);
    }

    function _assertStrategy(string memory filename, string memory agent, string memory modelVersion, bytes32 expected)
        private
        view
    {
        string memory path = string.concat("../runner/src/strategies/", filename);
        bytes memory exactBytes = vm.readFileBinary(path);
        string memory json = vm.readFile(path);

        assertEq(keccak256(exactBytes), expected, string.concat(agent, " strategy bytes changed"));
        assertEq(vm.parseJsonString(json, ".schema"), "mirror.strategy.v1", "wrong strategy schema");
        assertEq(vm.parseJsonString(json, ".agent"), agent, "wrong agent name");
        assertEq(vm.parseJsonString(json, ".modelVersion"), modelVersion, "wrong model version");
    }
}
