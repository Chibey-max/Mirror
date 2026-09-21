// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {CopyVault} from "../src/CopyVault.sol";
import {ICopyVault} from "../src/interfaces/ICopyVault.sol";
import {MockUSDG} from "../src/mocks/MockUSDG.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CustodyReturnToken is MockUSDG {
    uint256 public mode;

    function setMode(uint256 value) external {
        mode = value;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        super.transfer(to, amount);
        if (mode == 1) return false;
        if (mode == 2) {
            assembly {
                return(0, 0)
            }
        }
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        super.transferFrom(from, to, amount);
        if (mode == 1) return false;
        if (mode == 2) {
            assembly {
                return(0, 0)
            }
        }
        return true;
    }
}

contract VaultCustodyRegressionTest is Test {
    CustodyReturnToken token;
    CopyVault vault;

    function setUp() public {
        token = new CustodyReturnToken();
        // Custody has no dependency calls: code-bearing token is a placeholder for both.
        vault = new CopyVault(address(token), address(token), address(token), address(this));
    }

    function test_FalseReturnRollsBackCreditTokensAndAllowance() public {
        token.mint(address(this), 100);
        token.approve(address(vault), 100);
        token.setMode(1);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)));
        vault.deposit(100);
        assertEq(token.balanceOf(address(this)), 100);
        assertEq(vault.balanceOf(address(this)), 0);
        assertEq(token.allowance(address(this), address(vault)), 100);
        token.setMode(0);
        vault.deposit(100);
        token.setMode(1);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(token)));
        vault.withdraw(100);
        assertEq(vault.balanceOf(address(this)), 100);
        assertEq(token.balanceOf(address(vault)), 100);
    }

    function test_NoReturnTokenRoundTrip() public {
        token.mint(address(this), 100);
        token.approve(address(vault), 100);
        token.setMode(2);
        vault.deposit(100);
        vault.withdraw(100);
        assertEq(token.balanceOf(address(this)), 100);
        assertEq(vault.balanceOf(address(this)), 0);
    }

    function test_MissingAllowanceCreatesNoCredit() public {
        token.mint(address(this), 100);
        vm.expectRevert();
        vault.deposit(100);
        assertEq(vault.balanceOf(address(this)), 0);
        assertEq(token.balanceOf(address(this)), 100);
    }

    function test_ZeroAmountsAndExactlyOneEventPerOperation() public {
        vm.recordLogs();
        vault.deposit(0);
        assertEq(vm.getRecordedLogs().length, 2); // ERC20 Transfer plus Deposited
        vm.recordLogs();
        vault.withdraw(0);
        assertEq(vm.getRecordedLogs().length, 2); // ERC20 Transfer plus Withdrawn
        assertEq(vault.balanceOf(address(this)), 0);
    }

    function testFuzz_SequenceSolvencyAndExit(uint256 seed) public {
        address[3] memory users = [address(101), address(102), address(103)];
        uint256[3] memory expected;
        uint256 donations;
        for (uint256 i; i < 3; i++) {
            token.mint(users[i], 1_000_000);
            vm.prank(users[i]);
            token.approve(address(vault), type(uint256).max);
        }
        for (uint256 step; step < 64; step++) {
            seed = uint256(keccak256(abi.encode(seed, step)));
            uint256 u = seed % 3;
            uint256 action = (seed >> 8) % 4;
            uint256 amount = (seed >> 16) % 1000;
            if (action == 0) {
                vm.prank(users[u]);
                vault.deposit(amount);
                expected[u] += amount;
            }
            if (action == 1) {
                amount %= expected[u] + 1;
                vm.prank(users[u]);
                vault.withdraw(amount);
                expected[u] -= amount;
            }
            if (action == 2) {
                token.mint(address(vault), amount);
                donations += amount;
            }
            if (action == 3) {
                vm.expectRevert(ICopyVault.InsufficientBalance.selector);
                vm.prank(users[u]);
                vault.withdraw(expected[u] + 1);
            }
            uint256 sum;
            for (uint256 i; i < 3; i++) {
                assertEq(vault.balanceOf(users[i]), expected[i]);
                sum += expected[i];
            }
            assertEq(token.balanceOf(address(vault)), sum + donations);
        }
        for (uint256 i; i < 3; i++) {
            vm.prank(users[i]);
            vault.withdraw(expected[i]);
            assertEq(token.balanceOf(users[i]), 1_000_000);
        }
        assertEq(token.balanceOf(address(vault)), donations);
    }
}
