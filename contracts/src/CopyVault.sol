// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICopyVault} from "./interfaces/ICopyVault.sol";
import {ITrackRecord} from "./interfaces/ITrackRecord.sol";
import {IPolicyModule} from "./interfaces/IPolicyModule.sol";

/// @notice PRD v2.2 custody foundation. Follow/unfollow and mirroring are NOT implemented yet.
/// @dev Supports the exact-transfer MockUSDG only, not fee-on-transfer or rebasing assets.
///      Direct token donations create surplus, never user credit. No admin withdrawal path.
contract CopyVault is ICopyVault, ReentrancyGuard {
    using SafeERC20 for IERC20;
    error NotImplemented();
    ITrackRecord public immutable trackRecord;
    IPolicyModule public immutable policyModule;
    IERC20 public immutable usdg;
    address public immutable runner;
    mapping(address => uint256) private _free;

    constructor(address trackRecord_, address policyModule_, address usdg_, address runner_) {
        if (runner_ == address(0)) revert ZeroRunner();
        require(trackRecord_.code.length != 0, "CopyVault: invalid TrackRecord");
        require(policyModule_.code.length != 0, "CopyVault: invalid PolicyModule");
        require(usdg_.code.length != 0, "CopyVault: invalid USDG");
        trackRecord = ITrackRecord(trackRecord_);
        policyModule = IPolicyModule(policyModule_);
        usdg = IERC20(usdg_);
        runner = runner_;
    }

    function deposit(uint256 amount) external nonReentrant {
        usdg.safeTransferFrom(msg.sender, address(this), amount);
        _free[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount > _free[msg.sender]) revert InsufficientBalance();
        _free[msg.sender] -= amount;
        usdg.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function balanceOf(address user) external view returns (uint256) {
        return _free[user];
    }

    // Explicitly unavailable until follow lifecycle and policy integration are implemented.
    function follow(uint256, uint256, uint256) external pure {
        revert NotImplemented();
    }

    function mirrorFill(uint256) external pure {
        revert NotImplemented();
    }

    function unfollow(uint256) external pure {
        revert NotImplemented();
    }

    function allocationOf(address, uint256) external pure returns (uint256) {
        revert NotImplemented();
    }

    function positionOf(address, uint256, address) external pure returns (uint256) {
        revert NotImplemented();
    }

    function followersOf(uint256) external pure returns (address[] memory) {
        revert NotImplemented();
    }

    function followerCountOf(uint256) external pure returns (uint256) {
        revert NotImplemented();
    }

    function isMirrored(uint256) external pure returns (bool) {
        revert NotImplemented();
    }
}
