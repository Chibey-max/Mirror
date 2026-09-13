// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "./interfaces/IPolicyModule.sol";

/// @title PolicyModule
/// @notice Per-follower spend caps, token allowlist, and kill switch — PRD Section 4.3.
///
/// @dev STUB (Day 2). Storage layout and access control are in place; bodies land Day 5.
///
/// @dev FREEZE QUESTION for Sat 13 Sep 09:00 SGT — Section 4.3 defines `onlyVault` modifiers
///      but publishes no way to set the vault address. CopyVault is deployed AFTER PolicyModule
///      (it takes PolicyModule in its constructor), so the vault address cannot be a plain
///      constructor argument without precomputing it. Three options, pick one at the freeze:
///        (a) add a one-time `setVault(address)` behind onlyOwner  -> changes the frozen ABI
///        (b) precompute the CopyVault address (CREATE2) and pass it in the constructor
///        (c) deploy PolicyModule after CopyVault and pass PolicyModule in via a setter there
///      This stub assumes (b) so the ABI in Section 4.3 stays byte-for-byte as written.
contract PolicyModule is IPolicyModule, Ownable {
    error NotImplemented();
    error ZeroVault();

    /// @dev The CopyVault permitted to set, consume, and kill policies.
    address public immutable vault;

    /// @dev user => agentId => Policy
    mapping(address => mapping(uint256 => Policy)) internal _policies;

    /// @dev user => agentId => day index (block.timestamp / 1 days) => notional spent
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) internal _spentOnDay;

    /// @dev token => allowed
    mapping(address => bool) internal _tokenAllowlist;

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address vault_, address admin_) Ownable(admin_) {
        if (vault_ == address(0)) revert ZeroVault();
        vault = vault_;
    }

    /// @inheritdoc IPolicyModule
    function setPolicy(address user, uint256 agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps)
        external
        onlyVault
    {
        // TODO(Day 5): persist Policy{..., active: true}; emit PolicySet.
        user;
        agentId;
        maxNotionalPerDay;
        maxSlippageBps;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function checkAndConsume(address user, uint256 agentId, address token, uint256 notional)
        external
        onlyVault
        returns (bool)
    {
        // TODO(Day 5): revert PolicyInactive if !active; revert TokenNotAllowed(token) if not
        // allowlisted; revert CapExceeded(spent + notional, cap) if over the daily cap; else
        // consume against today's bucket and return true.
        //
        // CRITICAL: the cap check must revert, not return false. Patrick's PolicyRejectBanner
        // decodes the custom error from a reverted tx (PRD Section 5.3) — a silent `false`
        // gives the demo nothing to show and no explorer link to point at.
        user;
        agentId;
        token;
        notional;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function kill(address user, uint256 agentId) external onlyVault {
        // TODO(Day 5): set active = false; emit PolicyKilled.
        user;
        agentId;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function setTokenAllowlist(address token, bool allowed) external onlyOwner {
        // TODO(Day 5): _tokenAllowlist[token] = allowed;
        token;
        allowed;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function isTokenAllowed(address token) external view returns (bool) {
        return _tokenAllowlist[token];
    }

    /// @inheritdoc IPolicyModule
    function getPolicy(address user, uint256 agentId) external view returns (Policy memory) {
        return _policies[user][agentId];
    }

    /// @inheritdoc IPolicyModule
    function spentToday(address user, uint256 agentId) external view returns (uint256) {
        return _spentOnDay[user][agentId][block.timestamp / 1 days];
    }
}
