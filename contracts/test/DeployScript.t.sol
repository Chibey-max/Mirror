// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";

contract DeployScriptTest is Test {
    uint256 private constant DEPLOYER_KEY = 0xA11CE;
    uint256 private constant ADMIN_KEY = 0xB0B;
    uint256 private constant REGISTRAR_KEY = 0xCAFE;
    address private runner = makeAddr("runner");

    Deploy private script;

    function setUp() public {
        script = new Deploy();
        vm.deal(vm.addr(DEPLOYER_KEY), 100 ether);
        vm.deal(vm.addr(ADMIN_KEY), 10 ether);
        vm.deal(vm.addr(REGISTRAR_KEY), 10 ether);
    }

    function test_DeploysAndVerifiesCompleteWiring() public {
        Deploy.Deployment memory deployment = script.deploy(_config());

        assertEq(address(deployment.trackRecord.registry()), address(deployment.agentRegistry));
        assertEq(deployment.trackRecord.runner(), runner);
        assertEq(deployment.policyModule.vault(), address(deployment.copyVault));
        assertEq(deployment.policyModule.owner(), vm.addr(ADMIN_KEY));
        assertEq(deployment.copyVault.runner(), runner);
        assertEq(deployment.agentRegistry.agentCount(), 3);

        for (uint256 i; i < 3; ++i) {
            assertTrue(deployment.policyModule.isTokenAllowed(address(deployment.stocks[i])));
            assertEq(deployment.agentRegistry.getAgent(deployment.agentIds[i]).owner, vm.addr(REGISTRAR_KEY));
            assertEq(
                deployment.agentRegistry.getAgent(deployment.agentIds[i]).strategyHash, deployment.strategyHashes[i]
            );
            assertEq(deployment.feeds[i].owner(), runner);
        }
    }

    function test_RevertsWhenAnyRolesOverlap() public {
        Deploy.Config memory config = _config();
        config.runner = vm.addr(ADMIN_KEY);
        vm.expectRevert(abi.encodeWithSelector(Deploy.DuplicateRole.selector, config.runner));
        script.deploy(config);
    }

    function test_RevertsBeforeBroadcastForZeroKeyOrRunner() public {
        Deploy.Config memory config = _config();
        config.deployerPrivateKey = 0;
        vm.expectRevert(abi.encodeWithSelector(Deploy.ZeroPrivateKey.selector, bytes32("deployer")));
        script.deploy(config);

        config = _config();
        config.runner = address(0);
        vm.expectRevert(abi.encodeWithSelector(Deploy.ZeroRole.selector, bytes32("runner")));
        script.deploy(config);
    }

    function test_RequiresAFreshDeployerForCrossChainDeterminism() public {
        vm.setNonce(vm.addr(DEPLOYER_KEY), 1);
        vm.expectRevert(abi.encodeWithSelector(Deploy.UnexpectedDeployerNonce.selector, uint64(1)));
        script.deploy(_config());
    }

    function _config() private view returns (Deploy.Config memory) {
        return Deploy.Config({
            deployerPrivateKey: DEPLOYER_KEY,
            policyAdminPrivateKey: ADMIN_KEY,
            registrarPrivateKey: REGISTRAR_KEY,
            runner: runner,
            writeManifest: false
        });
    }
}
