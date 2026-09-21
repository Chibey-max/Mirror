// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {PolicyModule} from "../src/PolicyModule.sol";

/// @title PolicyModuleSurfaceTest
/// @notice Pins PolicyModule's external surface to PRD v2.2 §7.8. Owner: Isaac.
///
/// @dev The selectors below are what other people's code already depends on: Jason's CopyVault
///      calls `checkAndConsume` inside a try/catch, and Patrick's `usePolicyError` decodes the
///      four errors out of `MirrorRejected.reason` (PR #9, merged). A rename or a reordered
///      parameter changes a selector silently and breaks the rejection banner, which is the
///      demo's centrepiece — so each one is asserted against its literal value, not recomputed.
contract PolicyModuleSurfaceTest is Test {
    address internal constant VAULT = address(0xBEEF);
    address internal constant ADMIN = address(0xA11CE);

    PolicyModule internal policy;

    function setUp() public {
        policy = new PolicyModule(VAULT, ADMIN);
    }

    /// @dev v2.2 §7.5 added `bool isBuy` and dropped the `bool` return, which moves the selector.
    function test_CheckAndConsumeCarriesTheV22Selector() public pure {
        assertEq(
            IPolicyModule.checkAndConsume.selector,
            bytes4(0x5b2887e1),
            "checkAndConsume is not the v2.2 five-argument signature"
        );
    }

    /// @dev The v1.0 four-argument entry point must be gone, not merely unused: PolicyModule has
    ///      no fallback, so a call carrying the old selector has nowhere to land and must revert
    ///      whoever sends it. A silently accepted old call would consume a cap with no `isBuy`.
    function test_TheFourArgumentEntryPointIsGone() public {
        bytes memory oldCall =
            abi.encodeWithSelector(bytes4(0x03cf69e4), address(1), uint256(1), address(2), uint256(3));

        vm.prank(VAULT);
        (bool fromVault, bytes memory vaultReturn) = address(policy).call(oldCall);
        assertFalse(fromVault, "the old four-argument checkAndConsume still resolves");
        // An unmatched selector with no fallback reverts with EMPTY returndata. Asserting only
        // "it reverted" would pass while the old function still existed and reverted for some
        // other reason, which is exactly the vacuous-absence trap from Jason's PR #1 review.
        assertEq(vaultReturn.length, 0, "the old selector reverted with data - it still resolves");

        (bool fromStranger, bytes memory strangerReturn) = address(policy).call(oldCall);
        assertFalse(fromStranger, "PolicyModule answers unknown selectors - a fallback exists");
        assertEq(strangerReturn.length, 0, "unknown selector produced data - a fallback exists");
    }

    /// @dev Patrick decodes these four by selector. They are frozen (PRD v2.2 §7.8).
    function test_TheErrorSelectorsTheBannerDecodes() public pure {
        assertEq(IPolicyModule.CapExceeded.selector, bytes4(0xf480e285), "CapExceeded moved");
        assertEq(IPolicyModule.TokenNotAllowed.selector, bytes4(0x94403b70), "TokenNotAllowed moved");
        assertEq(IPolicyModule.PolicyInactive.selector, bytes4(0x7a9204f4), "PolicyInactive moved");
        assertEq(IPolicyModule.OnlyVault.selector, bytes4(0x8d1af8bd), "OnlyVault moved");
    }

    /// @dev D6: `ZeroVault` is constructor-only, so it lives on the contract, not the interface —
    ///      the same split TrackRecord uses for `ZeroRunner` and `ZeroRegistry`.
    function test_ZeroVaultIsDeclaredOnTheContract() public pure {
        assertEq(PolicyModule.ZeroVault.selector, bytes4(0xc68fcf82), "ZeroVault moved");
    }
}
