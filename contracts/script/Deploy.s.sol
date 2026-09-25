// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {PolicyModule} from "../src/PolicyModule.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {MockStock} from "../src/mocks/MockStock.sol";
import {MockAggregatorV3} from "../src/mocks/MockAggregatorV3.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

/// @notice Deterministic V1 deployment for Robinhood testnet and Arbitrum Sepolia.
contract Deploy is Script {
    error ZeroPrivateKey(bytes32 role);
    error ZeroRole(bytes32 role);
    error DuplicateRole(address duplicated);
    error UnexpectedDeployerNonce(uint64 actual);
    error PredictedVaultMismatch(address predicted, address actual);
    error WiringMismatch(bytes32 field);

    bytes32 private constant DEPLOYER_ROLE = "deployer";
    bytes32 private constant POLICY_ADMIN_ROLE = "policyAdmin";
    bytes32 private constant RUNNER_ROLE = "runner";
    bytes32 private constant REGISTRAR_ROLE = "registrar";

    struct Config {
        uint256 deployerPrivateKey;
        uint256 policyAdminPrivateKey;
        uint256 registrarPrivateKey;
        address runner;
        bool writeManifest;
    }

    struct Deployment {
        AgentRegistry agentRegistry;
        TrackRecord trackRecord;
        PolicyModule policyModule;
        CopyVault copyVault;
        MockUSDG usdg;
        MockStock[3] stocks;
        MockAggregatorV3[3] feeds;
        uint256[3] agentIds;
        bytes32[3] strategyHashes;
        address deployer;
        address policyAdmin;
        address runner;
        address registrar;
        uint256 deploymentBlock;
    }

    function run() external returns (Deployment memory deployment) {
        Config memory config = Config({
            deployerPrivateKey: uint256(vm.envBytes32("DEPLOYER_PRIVATE_KEY")),
            policyAdminPrivateKey: uint256(vm.envBytes32("POLICY_ADMIN_PRIVATE_KEY")),
            registrarPrivateKey: uint256(vm.envBytes32("AGENT_REGISTRAR_PRIVATE_KEY")),
            runner: vm.envAddress("RUNNER_ADDRESS"),
            writeManifest: vm.envOr("WRITE_DEPLOYMENT_MANIFEST", true)
        });
        deployment = deploy(config);
    }

    function deploy(Config memory config) public returns (Deployment memory deployment) {
        if (config.deployerPrivateKey == 0) revert ZeroPrivateKey(DEPLOYER_ROLE);
        if (config.policyAdminPrivateKey == 0) revert ZeroPrivateKey(POLICY_ADMIN_ROLE);
        if (config.registrarPrivateKey == 0) revert ZeroPrivateKey(REGISTRAR_ROLE);

        deployment.deployer = vm.addr(config.deployerPrivateKey);
        deployment.policyAdmin = vm.addr(config.policyAdminPrivateKey);
        deployment.runner = config.runner;
        deployment.registrar = vm.addr(config.registrarPrivateKey);
        deployment.deploymentBlock = block.number;
        validateRoles(deployment.deployer, deployment.policyAdmin, deployment.runner, deployment.registrar);
        uint64 deployerNonce = vm.getNonce(deployment.deployer);
        if (deployerNonce != 0) revert UnexpectedDeployerNonce(deployerNonce);

        vm.startBroadcast(config.deployerPrivateKey);
        deployment.agentRegistry = new AgentRegistry();
        deployment.trackRecord = new TrackRecord(address(deployment.agentRegistry), deployment.runner);
        deployment.usdg = new MockUSDG();
        deployment.stocks[0] = new MockStock("Mock NVIDIA", "mNVDA");
        deployment.stocks[1] = new MockStock("Mock Apple", "mAAPL");
        deployment.stocks[2] = new MockStock("Mock Tesla", "mTSLA");
        deployment.feeds[0] = new MockAggregatorV3(deployment.runner);
        deployment.feeds[1] = new MockAggregatorV3(deployment.runner);
        deployment.feeds[2] = new MockAggregatorV3(deployment.runner);

        address predictedVault = vm.computeCreateAddress(deployment.deployer, vm.getNonce(deployment.deployer) + 1);
        deployment.policyModule = new PolicyModule(predictedVault, deployment.policyAdmin);
        deployment.copyVault = new CopyVault(
            address(deployment.trackRecord),
            address(deployment.policyModule),
            address(deployment.usdg),
            deployment.runner
        );
        vm.stopBroadcast();

        if (address(deployment.copyVault) != predictedVault) {
            revert PredictedVaultMismatch(predictedVault, address(deployment.copyVault));
        }

        vm.startBroadcast(config.policyAdminPrivateKey);
        for (uint256 i; i < deployment.stocks.length; ++i) {
            deployment.policyModule.setTokenAllowlist(address(deployment.stocks[i]), true);
        }
        vm.stopBroadcast();

        (string[3] memory names, string[3] memory versions, bytes32[3] memory hashes) = _strategyDefinitions();
        deployment.strategyHashes = hashes;
        vm.startBroadcast(config.registrarPrivateKey);
        for (uint256 i; i < names.length; ++i) {
            deployment.agentIds[i] = deployment.agentRegistry.registerAgent(names[i], hashes[i], versions[i]);
        }
        vm.stopBroadcast();

        _assertWiring(deployment);
        if (config.writeManifest) _writePendingManifest(deployment);
    }

    function validateRoles(address deployer, address policyAdmin, address runner, address registrar) public pure {
        address[4] memory roles = [deployer, policyAdmin, runner, registrar];
        bytes32[4] memory labels = [DEPLOYER_ROLE, POLICY_ADMIN_ROLE, RUNNER_ROLE, REGISTRAR_ROLE];
        for (uint256 i; i < roles.length; ++i) {
            if (roles[i] == address(0)) revert ZeroRole(labels[i]);
            for (uint256 j; j < i; ++j) {
                if (roles[i] == roles[j]) revert DuplicateRole(roles[i]);
            }
        }
    }

    function _strategyDefinitions()
        private
        view
        returns (string[3] memory names, string[3] memory versions, bytes32[3] memory hashes)
    {
        string[3] memory files = ["pulse.json", "red.json", "drift.json"];
        for (uint256 i; i < files.length; ++i) {
            string memory path = string.concat("../runner/src/strategies/", files[i]);
            bytes memory exactBytes = vm.readFileBinary(path);
            string memory json = vm.readFile(path);
            names[i] = vm.parseJsonString(json, ".agent");
            versions[i] = vm.parseJsonString(json, ".modelVersion");
            hashes[i] = keccak256(exactBytes);
        }
    }

    function _assertWiring(Deployment memory deployment) private view {
        if (address(deployment.trackRecord.registry()) != address(deployment.agentRegistry)) {
            revert WiringMismatch("trackRecord.registry");
        }
        if (deployment.trackRecord.runner() != deployment.runner) revert WiringMismatch("trackRecord.runner");
        if (deployment.policyModule.vault() != address(deployment.copyVault)) revert WiringMismatch("policy.vault");
        if (deployment.policyModule.owner() != deployment.policyAdmin) revert WiringMismatch("policy.owner");
        if (address(deployment.copyVault.trackRecord()) != address(deployment.trackRecord)) {
            revert WiringMismatch("vault.trackRecord");
        }
        if (address(deployment.copyVault.policyModule()) != address(deployment.policyModule)) {
            revert WiringMismatch("vault.policyModule");
        }
        if (address(deployment.copyVault.usdg()) != address(deployment.usdg)) revert WiringMismatch("vault.usdg");
        if (deployment.copyVault.runner() != deployment.runner) revert WiringMismatch("vault.runner");

        for (uint256 i; i < deployment.stocks.length; ++i) {
            if (!deployment.policyModule.isTokenAllowed(address(deployment.stocks[i]))) {
                revert WiringMismatch("policy.allowlist");
            }
            IAgentRegistry.Agent memory agent = deployment.agentRegistry.getAgent(deployment.agentIds[i]);
            if (agent.owner != deployment.registrar) revert WiringMismatch("agent.owner");
            if (agent.strategyHash != deployment.strategyHashes[i]) revert WiringMismatch("agent.strategyHash");
        }
    }

    /// @dev Forge scripts execute once in simulation before broadcast, so this file is deliberately
    ///      provisional: it cannot truthfully contain mined blocks or receipts. finalize-manifest.mjs
    ///      validates every mined receipt and promotes it into deployments/<chain-id>.json.
    function _writePendingManifest(Deployment memory deployment) private {
        address[] memory stocks = new address[](3);
        address[] memory feeds = new address[](3);
        uint256[] memory agentIds = new uint256[](3);
        bytes32[] memory strategyHashes = new bytes32[](3);
        bytes32[] memory coreRuntimeCodeHashes = new bytes32[](4);
        for (uint256 i; i < 3; ++i) {
            stocks[i] = address(deployment.stocks[i]);
            feeds[i] = address(deployment.feeds[i]);
            agentIds[i] = deployment.agentIds[i];
            strategyHashes[i] = deployment.strategyHashes[i];
        }
        coreRuntimeCodeHashes[0] = keccak256(address(deployment.agentRegistry).code);
        coreRuntimeCodeHashes[1] = keccak256(address(deployment.trackRecord).code);
        coreRuntimeCodeHashes[2] = keccak256(address(deployment.policyModule).code);
        coreRuntimeCodeHashes[3] = keccak256(address(deployment.copyVault).code);

        string memory object = "mirror-deployment";
        vm.serializeString(object, "schema", "mirror.deployments.v1");
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeUint(object, "deploymentBlock", deployment.deploymentBlock);
        vm.serializeAddress(object, "deployer", deployment.deployer);
        vm.serializeAddress(object, "policyAdmin", deployment.policyAdmin);
        vm.serializeAddress(object, "runner", deployment.runner);
        vm.serializeAddress(object, "agentRegistrar", deployment.registrar);
        vm.serializeAddress(object, "agentRegistry", address(deployment.agentRegistry));
        vm.serializeAddress(object, "trackRecord", address(deployment.trackRecord));
        vm.serializeAddress(object, "policyModule", address(deployment.policyModule));
        vm.serializeAddress(object, "copyVault", address(deployment.copyVault));
        vm.serializeAddress(object, "usdg", address(deployment.usdg));
        vm.serializeAddress(object, "stockTokens", stocks);
        vm.serializeAddress(object, "priceFeeds", feeds);
        vm.serializeUint(object, "agentIds", agentIds);
        vm.serializeBytes32(object, "strategyHashes", strategyHashes);
        string memory json = vm.serializeBytes32(object, "coreRuntimeCodeHashes", coreRuntimeCodeHashes);

        string memory directory = string.concat(vm.projectRoot(), "/../deployments/.pending");
        vm.createDir(directory, true);
        string memory path = string.concat(directory, "/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
    }
}
