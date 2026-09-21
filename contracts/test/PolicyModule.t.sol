// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {PolicyModule} from "../src/PolicyModule.sol";

/// @title PolicyModuleTest
/// @notice PolicyModule's behaviour, PRD v2.2 §7.5, §7.6 and §7.8. Owner: Isaac.
///
/// @dev Each test is named after the claim it proves, so the list reads as the evidence for
///      "a follower never gives an agent custody beyond the cap they set" (PRD claim 2).
contract PolicyModuleTest is Test {
    PolicyModule internal policy;

    address internal vault = makeAddr("vault");
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal mNVDA = makeAddr("mNVDA");

    uint256 internal constant AGENT = 7;
    uint256 internal constant CAP = 60e6; // 60 USDG, raw 6dp (§8)
    uint256 internal constant SLIPPAGE = 50; // bps, stored and shown, never enforced (§9)

    function setUp() public {
        policy = new PolicyModule(vault, admin);
    }

    function _setPolicy(uint256 cap) internal {
        vm.prank(vault);
        policy.setPolicy(alice, AGENT, cap, SLIPPAGE);
    }

    // --- constructor -------------------------------------------------------

    function test_Constructor_StoresVaultAndOwner() public view {
        assertEq(policy.vault(), vault, "vault not stored");
        assertEq(policy.owner(), admin, "admin not stored as owner");
    }

    function test_Constructor_RejectsZeroVault() public {
        vm.expectRevert(PolicyModule.ZeroVault.selector);
        new PolicyModule(address(0), admin);
    }

    /// @dev The vault address is a PREDICTION: §6 deploys PolicyModule at step 5 and CopyVault at
    ///      step 6, so the address it is given has no code yet and cannot be required to. This is
    ///      deliberately unlike TrackRecord, whose registry must already exist (its D5).
    function test_Constructor_AcceptsAVaultThatHasNoCodeYet() public {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        assertEq(predicted.code.length, 0, "the predicted vault already has code - test is meaningless");

        PolicyModule fresh = new PolicyModule(predicted, admin);
        assertEq(fresh.vault(), predicted, "a codeless predicted vault was not accepted");
    }

    /// @dev OpenZeppelin's own guard covers a zero admin, so no ZeroAdmin error is needed (D5).
    function test_Constructor_RejectsZeroAdmin() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new PolicyModule(vault, address(0));
    }

    function test_FreshModule_ReadsAsEmptyWithoutReverting() public view {
        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, 0, "unknown policy has a cap");
        assertEq(p.maxSlippageBps, 0, "unknown policy has slippage");
        assertFalse(p.active, "unknown policy is active");
        assertEq(policy.spentToday(alice, AGENT), 0, "unknown policy has spent something");
        assertFalse(policy.isTokenAllowed(mNVDA), "a token is allowlisted before the owner said so");
    }

    // --- setPolicy ---------------------------------------------------------

    function test_SetPolicy_StoresEveryFieldAndActivatesTheFollow() public {
        _setPolicy(CAP);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, CAP, "cap not stored");
        assertEq(p.maxSlippageBps, SLIPPAGE, "slippage not stored");
        assertTrue(p.active, "follow not activated");
    }

    function test_SetPolicy_TouchesOnlyTheGivenFollowerAndAgent() public {
        _setPolicy(CAP);

        assertFalse(policy.getPolicy(alice, AGENT + 1).active, "a different agent was activated");
        assertFalse(policy.getPolicy(address(0xB0B), AGENT).active, "a different follower was activated");
    }

    function test_SetPolicy_EmitsExactlyOnePolicySetWithExactArguments() public {
        vm.recordLogs();
        _setPolicy(CAP);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "expected exactly one event");
        assertEq(logs[0].topics[0], keccak256("PolicySet(address,uint256,uint256,uint256)"), "wrong event");
        assertEq(logs[0].topics[1], bytes32(uint256(uint160(alice))), "user is not indexed as alice");
        assertEq(logs[0].topics[2], bytes32(AGENT), "agentId is not indexed as the agent");
        (uint256 cap, uint256 slippage) = abi.decode(logs[0].data, (uint256, uint256));
        assertEq(cap, CAP, "event cap differs from the stored cap");
        assertEq(slippage, SLIPPAGE, "event slippage differs from the stored slippage");
    }

    function testFuzz_SetPolicy_OnlyTheVaultCanCall(address caller) public {
        vm.assume(caller != vault);

        vm.prank(caller);
        vm.expectRevert(IPolicyModule.OnlyVault.selector);
        policy.setPolicy(alice, AGENT, CAP, SLIPPAGE);

        assertFalse(policy.getPolicy(alice, AGENT).active, "a rejected call still wrote a policy");
    }

    /// @dev D5: the vault is the only caller and a follower's own numbers are their business, so
    ///      there is no validation here and no error to add to the frozen ABI. A zero cap simply
    ///      rejects every buy; maxSlippageBps is not enforced at all (§9).
    function testFuzz_SetPolicy_AcceptsAnyCapAndAnySlippage(uint256 cap, uint256 slippage) public {
        vm.prank(vault);
        policy.setPolicy(alice, AGENT, cap, slippage);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, cap, "cap not stored verbatim");
        assertEq(p.maxSlippageBps, slippage, "slippage not stored verbatim");
        assertTrue(p.active, "follow not activated");
    }

    /// @dev CopyVault rejects a second follow with AlreadyFollowing, so in practice this only
    ///      happens on a re-follow after unfollow. It must overwrite, not accumulate.
    function test_SetPolicy_OverwritesAnExistingPolicy() public {
        _setPolicy(CAP);

        vm.prank(vault);
        policy.setPolicy(alice, AGENT, 25e6, 999);

        IPolicyModule.Policy memory p = policy.getPolicy(alice, AGENT);
        assertEq(p.maxNotionalPerDay, 25e6, "cap not replaced");
        assertEq(p.maxSlippageBps, 999, "slippage not replaced");
        assertTrue(p.active, "follow not active after re-follow");
    }
}
