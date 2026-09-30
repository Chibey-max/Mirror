// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Deterministic, non-privileged proof of the live principal lifecycle on chain 46630.
/// @dev Run prepare(), then eligible Pulse trades, then exit(). Interrupted broadcasts must be
///      resumed from their Forge artifact rather than restarted as a new logical operation.
contract SmokeLifecycle is Script {
    error WrongChain(uint256 actual);
    error ZeroPrivateKey();
    error SmokeIdentityMismatch(address derived, address configured);
    error SmokeStateMismatch(bytes32 field);

    uint256 private constant DEPOSIT = 100_000_000;
    uint256 private constant CAP = 60_000_000;
    uint256 private constant SLIPPAGE_BPS = 50;

    struct Deployment {
        MockUSDG usdg;
        CopyVault vault;
        PolicyModule policy;
        TrackRecord trackRecord;
        address mNvda;
        address mTsla;
        uint256 pulseId;
    }

    function prepare() external {
        (Deployment memory deployment, uint256 privateKey, address follower) = _load();
        if (deployment.usdg.balanceOf(follower) != 0) revert SmokeStateMismatch("starting.walletBalance");
        if (deployment.vault.balanceOf(follower) != 0) revert SmokeStateMismatch("starting.freeBalance");
        if (deployment.vault.allocationOf(follower, deployment.pulseId) != 0) {
            revert SmokeStateMismatch("starting.allocation");
        }
        if (_contains(deployment.vault.followersOf(deployment.pulseId), follower)) {
            revert SmokeStateMismatch("starting.followers");
        }

        vm.startBroadcast(privateKey);
        deployment.usdg.mint(follower, _deposit());
        IERC20(address(deployment.usdg)).approve(address(deployment.vault), _deposit());
        deployment.vault.deposit(_deposit());
        deployment.vault.follow(deployment.pulseId, _cap(), SLIPPAGE_BPS);
        vm.stopBroadcast();
        _assertPrepared(deployment, follower);
    }

    function exit() external {
        (Deployment memory deployment, uint256 privateKey, address follower) = _load();
        _assertRunner(deployment, follower);

        vm.startBroadcast(privateKey);
        deployment.vault.unfollow(deployment.pulseId);
        deployment.vault.withdraw(_deposit());
        vm.stopBroadcast();

        _assertExited(deployment, follower);
    }

    /// @notice Re-read the prepared follower state from the connected RPC after prepare is mined.
    function checkPrepared() external view {
        (Deployment memory deployment,, address follower) = _load();
        _assertPrepared(deployment, follower);
    }

    /// @notice Re-read both runner outcomes from the connected RPC before exiting.
    function checkRunner() external view {
        (Deployment memory deployment,, address follower) = _load();
        _assertRunner(deployment, follower);
    }

    /// @notice Re-read the killed policy and returned principal after exit is mined.
    function checkExited() external view {
        (Deployment memory deployment,, address follower) = _load();
        _assertExited(deployment, follower);
    }

    function _assertPrepared(Deployment memory deployment, address follower) private view {
        if (deployment.usdg.balanceOf(follower) != 0) revert SmokeStateMismatch("prepared.walletBalance");
        if (deployment.vault.balanceOf(follower) != _deposit() - _cap()) {
            revert SmokeStateMismatch("prepared.freeBalance");
        }
        if (deployment.vault.allocationOf(follower, deployment.pulseId) != _cap()) {
            revert SmokeStateMismatch("prepared.allocation");
        }
        IPolicyModule.Policy memory policy = deployment.policy.getPolicy(follower, deployment.pulseId);
        if (!policy.active || policy.maxNotionalPerDay != _cap() || policy.maxSlippageBps != SLIPPAGE_BPS) {
            revert SmokeStateMismatch("prepared.policy");
        }
    }

    function _assertRunner(Deployment memory deployment, address follower) private view {
        uint256 acceptedId = vm.envUint("SMOKE_ACCEPTED_FILL_ID");
        uint256 rejectedId = vm.envUint("SMOKE_REJECTED_FILL_ID");
        uint256 boundary = deployment.vault.followFillBoundaryOf(follower, deployment.pulseId);
        if (acceptedId <= boundary || rejectedId <= acceptedId) revert SmokeStateMismatch("runner.eligibility");
        ITrackRecord.Fill memory accepted = deployment.trackRecord.getFill(acceptedId);
        ITrackRecord.Fill memory rejected = deployment.trackRecord.getFill(rejectedId);
        if (accepted.fillId == 0 || accepted.agentId != deployment.pulseId || !accepted.isBuy) {
            revert SmokeStateMismatch("runner.acceptedFill");
        }
        if (rejected.fillId == 0 || rejected.agentId != deployment.pulseId || !rejected.isBuy) {
            revert SmokeStateMismatch("runner.rejectedFill");
        }
        if (!deployment.vault.isMirrored(acceptedId) || !deployment.vault.isMirrored(rejectedId)) {
            revert SmokeStateMismatch("runner.processed");
        }
        if (deployment.vault.positionOf(follower, deployment.pulseId, accepted.token) != accepted.size) {
            revert SmokeStateMismatch("runner.acceptedPosition");
        }
        uint256 expectedRejectedPosition = rejected.token == accepted.token ? accepted.size : 0;
        if (deployment.vault.positionOf(follower, deployment.pulseId, rejected.token) != expectedRejectedPosition) {
            revert SmokeStateMismatch("runner.rejectedPosition");
        }
        uint256 notional = Math.mulDiv(accepted.size, accepted.price, 1e20, Math.Rounding.Ceil);
        uint256 rejectedNotional = Math.mulDiv(rejected.size, rejected.price, 1e20, Math.Rounding.Ceil);
        if (notional > _cap() || rejectedNotional <= _cap() - notional) {
            revert SmokeStateMismatch("runner.capScenario");
        }
        if (deployment.policy.spentToday(follower, deployment.pulseId) != notional) {
            revert SmokeStateMismatch("runner.spentToday");
        }
    }

    function _assertExited(Deployment memory deployment, address follower) private view {
        IPolicyModule.Policy memory policy = deployment.policy.getPolicy(follower, deployment.pulseId);
        if (policy.active) revert SmokeStateMismatch("exited.policy");
        if (deployment.vault.allocationOf(follower, deployment.pulseId) != 0) {
            revert SmokeStateMismatch("exited.allocation");
        }
        if (_contains(deployment.vault.followersOf(deployment.pulseId), follower)) {
            revert SmokeStateMismatch("exited.followers");
        }
        if (deployment.vault.balanceOf(follower) != 0) revert SmokeStateMismatch("exited.freeBalance");
        if (deployment.usdg.balanceOf(follower) != _deposit()) revert SmokeStateMismatch("exited.walletBalance");
    }

    function _cap() private view returns (uint256) {
        uint256 amount = vm.envOr("SMOKE_CAP", CAP);
        if (amount == 0 || amount > _deposit()) revert SmokeStateMismatch("config.cap");
        return amount;
    }

    function _deposit() private view returns (uint256) {
        return vm.envOr("SMOKE_DEPOSIT", DEPOSIT);
    }

    function _load() private view returns (Deployment memory deployment, uint256 privateKey, address follower) {
        if (block.chainid != 46_630) revert WrongChain(block.chainid);
        privateKey = uint256(vm.envBytes32("SMOKE_FOLLOWER_PRIVATE_KEY"));
        if (privateKey == 0) revert ZeroPrivateKey();
        follower = vm.addr(privateKey);
        address configured = vm.envAddress("SMOKE_FOLLOWER_ADDRESS");
        if (configured != follower) revert SmokeIdentityMismatch(follower, configured);

        string memory defaultPath = string.concat(vm.projectRoot(), "/../deployments/46630.json");
        string memory path = vm.envOr("SMOKE_DEPLOYMENT_MANIFEST", defaultPath);
        string memory json = vm.readFile(path);
        if (vm.parseJsonUint(json, ".chainId") != 46_630) revert SmokeStateMismatch("manifest.chainId");
        address[] memory stocks = vm.parseJsonAddressArray(json, ".stockTokens");
        uint256[] memory agentIds = vm.parseJsonUintArray(json, ".agentIds");
        if (stocks.length != 3 || agentIds.length != 3) revert SmokeStateMismatch("manifest.arrays");
        deployment = Deployment({
            usdg: MockUSDG(vm.parseJsonAddress(json, ".usdg")),
            vault: CopyVault(vm.parseJsonAddress(json, ".copyVault")),
            policy: PolicyModule(vm.parseJsonAddress(json, ".policyModule")),
            trackRecord: TrackRecord(vm.parseJsonAddress(json, ".trackRecord")),
            mNvda: stocks[0],
            mTsla: stocks[2],
            pulseId: agentIds[0]
        });
    }

    function _contains(address[] memory values, address target) private pure returns (bool) {
        for (uint256 i; i < values.length; ++i) {
            if (values[i] == target) return true;
        }
        return false;
    }
}
