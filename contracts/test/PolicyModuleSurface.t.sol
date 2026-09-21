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

    // --- the frozen surface -------------------------------------------------

    /// @dev Path is relative to the Foundry root; `fs_permissions` grants read on ./out.
    string internal constant ARTIFACT = "out/PolicyModule.sol/PolicyModule.json";

    /// @dev The complete external surface: PRD v2.2 §7.8 plus what OpenZeppelin's Ownable adds,
    ///      which v2.1 §5.3 adopted deliberately for key rotation.
    function _frozenSurface() internal pure returns (string[] memory frozen) {
        frozen = new string[](11);
        frozen[0] = "setPolicy(address,uint256,uint256,uint256)";
        frozen[1] = "checkAndConsume(address,uint256,address,uint256,bool)";
        frozen[2] = "kill(address,uint256)";
        frozen[3] = "setTokenAllowlist(address,bool)";
        frozen[4] = "isTokenAllowed(address)";
        frozen[5] = "getPolicy(address,uint256)";
        frozen[6] = "spentToday(address,uint256)";
        frozen[7] = "vault()";
        frozen[8] = "owner()";
        frozen[9] = "transferOwnership(address)";
        frozen[10] = "renounceOwnership()";
    }

    /// @dev ALLOWLIST — the load-bearing assertion. Any added function, under any name, arity or
    ///      mutability, appears in the dispatch table and fails here. Do not widen it to make a
    ///      failure go away: that is an ABI change and a whole-team sync.
    function test_DispatchTableIsExactlyTheFrozenSurface() public view {
        string[] memory actual = vm.parseJsonKeys(vm.readFile(ARTIFACT), ".methodIdentifiers");
        string[] memory frozen = _frozenSurface();

        for (uint256 i = 0; i < actual.length; i++) {
            assertTrue(
                _contains(frozen, actual[i]),
                string.concat("UNFROZEN function is dispatchable on PolicyModule: ", actual[i])
            );
        }
        for (uint256 i = 0; i < frozen.length; i++) {
            assertTrue(_contains(actual, frozen[i]), string.concat("frozen function went missing: ", frozen[i]));
        }
    }

    /// @dev The guarantees enforced by omission, spelled out as names a later change might reach
    ///      for. `vault` is immutable, a cap and a day's spend are the vault's to move and no one
    ///      else's, and a killed follow is never revived by anything but a fresh follow.
    function test_NoVaultSetterCapOverrideOrRevivalIsDispatchable() public view {
        string[] memory actual = vm.parseJsonKeys(vm.readFile(ARTIFACT), ".methodIdentifiers");
        string[] memory forbidden = new string[](12);
        forbidden[0] = "setVault";
        forbidden[1] = "updateVault";
        forbidden[2] = "setCap";
        forbidden[3] = "setSpent";
        forbidden[4] = "resetSpent";
        forbidden[5] = "setActive";
        forbidden[6] = "reactivate";
        forbidden[7] = "revive";
        forbidden[8] = "initialize";
        forbidden[9] = "upgradeTo";
        forbidden[10] = "sweep";
        forbidden[11] = "rescue";

        for (uint256 i = 0; i < actual.length; i++) {
            for (uint256 j = 0; j < forbidden.length; j++) {
                assertFalse(
                    _startsWith(actual[i], string.concat(forbidden[j], "(")),
                    string.concat("FORBIDDEN function is dispatchable on PolicyModule: ", actual[i])
                );
            }
        }
    }

    /// @dev Events and errors are not in methodIdentifiers, so they are locked separately. This is
    ///      what stops an additive ABI change — an allowlist event, say — landing without sign-off.
    function test_EventsAndErrorsAreExactlyTheFrozenSet() public view {
        string[] memory events = _abiNamesOfType("event");
        string[] memory frozenEvents = new string[](4);
        frozenEvents[0] = "PolicySet";
        frozenEvents[1] = "PolicyKilled";
        frozenEvents[2] = "TokenAllowlisted";
        frozenEvents[3] = "OwnershipTransferred";
        _assertSameSet(events, frozenEvents, "event");

        string[] memory errors = _abiNamesOfType("error");
        string[] memory frozenErrors = new string[](7);
        frozenErrors[0] = "CapExceeded";
        frozenErrors[1] = "TokenNotAllowed";
        frozenErrors[2] = "PolicyInactive";
        frozenErrors[3] = "OnlyVault";
        frozenErrors[4] = "ZeroVault";
        frozenErrors[5] = "OwnableInvalidOwner";
        frozenErrors[6] = "OwnableUnauthorizedAccount";
        _assertSameSet(errors, frozenErrors, "error");
    }

    function test_AbiDeclaresNoFallbackOrReceive() public view {
        string[] memory entryTypes = _abiEntryTypes();
        assertGt(entryTypes.length, 0, "ABI walk returned nothing - is the artifact path right?");

        for (uint256 i = 0; i < entryTypes.length; i++) {
            assertFalse(_eq(entryTypes[i], "fallback"), "FORBIDDEN: PolicyModule declares a fallback");
            assertFalse(_eq(entryTypes[i], "receive"), "FORBIDDEN: PolicyModule declares a receive function");
        }
    }

    /// @dev PolicyModule must never hold value: it decides, CopyVault custodies.
    function test_NoFunctionIsPayable() public view {
        string memory json = vm.readFile(ARTIFACT);
        uint256 checked;

        for (uint256 i = 0; i < 256; i++) {
            string memory at = string.concat("$.abi[", vm.toString(i), "]");
            try vm.parseJsonString(json, string.concat(at, ".type")) returns (string memory entryType) {
                if (!_eq(entryType, "function")) continue;
                string memory mutability = vm.parseJsonString(json, string.concat(at, ".stateMutability"));
                assertFalse(_eq(mutability, "payable"), "FORBIDDEN: PolicyModule has a payable function");
                checked++;
            } catch {
                break;
            }
        }

        assertEq(checked, 11, "expected to inspect exactly the 11 frozen functions");
    }

    function test_BareCallsAndEthTransfersAreRefused() public {
        (bool okEmpty,) = address(policy).call("");
        assertFalse(okEmpty, "PolicyModule accepts bare calls");

        vm.deal(address(this), 1 ether);
        (bool okValue,) = address(policy).call{value: 1 wei}("");
        assertFalse(okValue, "PolicyModule accepted ETH");

        (bool okPayableKill,) =
            address(policy).call{value: 1 wei}(abi.encodeCall(IPolicyModule.kill, (address(0xA), 1)));
        assertFalse(okPayableKill, "kill accepted ETH");
        assertEq(address(policy).balance, 0, "PolicyModule holds a balance");
    }

    // --- artifact helpers ---------------------------------------------------

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

    function _abiNamesOfType(string memory wanted) internal view returns (string[] memory names) {
        string memory json = vm.readFile(ARTIFACT);
        string[] memory buffer = new string[](256);
        uint256 count;

        for (uint256 i = 0; i < 256; i++) {
            string memory at = string.concat("$.abi[", vm.toString(i), "]");
            try vm.parseJsonString(json, string.concat(at, ".type")) returns (string memory entryType) {
                if (_eq(entryType, wanted)) {
                    buffer[count++] = vm.parseJsonString(json, string.concat(at, ".name"));
                }
            } catch {
                break;
            }
        }

        names = new string[](count);
        for (uint256 i = 0; i < count; i++) {
            names[i] = buffer[i];
        }
    }

    function _assertSameSet(string[] memory actual, string[] memory frozen, string memory kind) internal pure {
        for (uint256 i = 0; i < actual.length; i++) {
            assertTrue(_contains(frozen, actual[i]), string.concat("UNFROZEN ", kind, " on PolicyModule: ", actual[i]));
        }
        for (uint256 i = 0; i < frozen.length; i++) {
            assertTrue(_contains(actual, frozen[i]), string.concat("frozen ", kind, " went missing: ", frozen[i]));
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

    function _startsWith(string memory str, string memory prefix) internal pure returns (bool) {
        bytes memory b = bytes(str);
        bytes memory pre = bytes(prefix);
        if (pre.length > b.length) return false;
        for (uint256 i = 0; i < pre.length; i++) {
            if (b[i] != pre[i]) return false;
        }
        return true;
    }
}
