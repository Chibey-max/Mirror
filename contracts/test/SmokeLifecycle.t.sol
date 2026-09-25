// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {SmokeLifecycle} from "../script/SmokeLifecycle.s.sol";
import {IPolicyModule} from "../src/interfaces/IPolicyModule.sol";

contract SmokeLifecycleTest is Test {
    uint256 private constant DEPLOYER_KEY = 0xA11CE;
    uint256 private constant ADMIN_KEY = 0xB0B;
    uint256 private constant REGISTRAR_KEY = 0xCAFE;
    uint256 private constant SMOKE_KEY = 0xF0110;
    address private runner = makeAddr("runner");

    function test_PreparesProvesAndExitsTheLiveScenario() public {
        vm.chainId(46_630);
        vm.deal(vm.addr(DEPLOYER_KEY), 100 ether);
        vm.deal(vm.addr(ADMIN_KEY), 10 ether);
        vm.deal(vm.addr(REGISTRAR_KEY), 10 ether);
        vm.deal(vm.addr(SMOKE_KEY), 10 ether);

        Deploy deploy = new Deploy();
        Deploy.Deployment memory deployment = deploy.deploy(
            Deploy.Config({
                deployerPrivateKey: DEPLOYER_KEY,
                policyAdminPrivateKey: ADMIN_KEY,
                registrarPrivateKey: REGISTRAR_KEY,
                runner: runner,
                writeManifest: true
            })
        );

        vm.setEnv("SMOKE_FOLLOWER_PRIVATE_KEY", vm.toString(bytes32(SMOKE_KEY)));
        vm.setEnv("SMOKE_FOLLOWER_ADDRESS", vm.toString(vm.addr(SMOKE_KEY)));
        vm.setEnv("SMOKE_DEPLOYMENT_MANIFEST", string.concat(vm.projectRoot(), "/../deployments/.pending/46630.json"));

        SmokeLifecycle smoke = new SmokeLifecycle();
        smoke.prepare();
        smoke.checkPrepared();

        vm.startPrank(runner);
        uint256 acceptedId = deployment.trackRecord
            .recordFill(
                deployment.agentIds[0],
                address(deployment.stocks[0]),
                true,
                420_000_000_000_000_000,
                13_020_000_000,
                bytes32(uint256(1))
            );
        deployment.copyVault.mirrorFill(acceptedId);
        uint256 rejectedId = deployment.trackRecord
            .recordFill(
                deployment.agentIds[0],
                address(deployment.stocks[2]),
                true,
                420_000_000_000_000_000,
                41_600_000_000,
                bytes32(uint256(2))
            );
        deployment.copyVault.mirrorFill(rejectedId);
        vm.stopPrank();

        smoke.checkRunner();
        smoke.exit();
        smoke.checkExited();

        address follower = vm.addr(SMOKE_KEY);
        IPolicyModule.Policy memory policy = deployment.policyModule.getPolicy(follower, deployment.agentIds[0]);
        assertFalse(policy.active);
        assertEq(deployment.copyVault.allocationOf(follower, deployment.agentIds[0]), 0);
        assertEq(deployment.copyVault.balanceOf(follower), 0);
        assertEq(deployment.usdg.balanceOf(follower), 100_000_000);
    }
}
