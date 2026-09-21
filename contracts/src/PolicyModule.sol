// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPolicyModule} from "./interfaces/IPolicyModule.sol";

/// @title PolicyModule
/// @notice Per-follower daily spend caps, a token allowlist, and the kill switch — PRD v2.2 §7.8.
///
/// @dev What this contract is for: PRD claim 2, capital safety. A follower never gives an agent
///      custody beyond a cap they set themselves, and holds a kill switch nobody can override.
///      It decides only whether a copied trade may happen; CopyVault holds and moves the USDG.
///
/// @dev Trust model, stated here and not only in the README:
///      - `vault` is the only address that may set, consume or kill a policy. It is immutable and
///        set at construction to the address CopyVault will occupy — plain nonce-based CREATE
///        prediction, v2.2 §6, verified on-chain after the deploy. There is no setter, no
///        upgrade path and no `delegatecall`.
///      - The owner's only power is the token allowlist, plus OpenZeppelin's ownership transfer
///        and renouncement. No owner path can change a cap, today's spend or a follow's `active`
///        flag, and this contract never holds funds.
///      - Removing a token from the allowlist stops mirrors of it in both directions. It cannot
///        strand principal: CopyVault returns principal only (v2.2 §7.3).
///      - The follower's kill switch reaches `kill` through `CopyVault.unfollow`, which is the
///        exit path for their principal, so `kill` never reverts for the vault.
///
/// @dev STUB: the surface below is v2.2's, the bodies land in the commits that follow.
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
        // TODO: persist Policy{..., active: true}; emit PolicySet. Today's spend is keyed by day,
        // not by follow, so it is deliberately untouched here (D4).
        user;
        agentId;
        maxNotionalPerDay;
        maxSlippageBps;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function checkAndConsume(address user, uint256 agentId, address token, uint256 notional, bool isBuy)
        external
        onlyVault
    {
        // TODO: revert PolicyInactive if !active, then TokenNotAllowed(token) if not allowlisted,
        // then — buys only — CapExceeded(spentToday + notional, cap) when that total exceeds the
        // cap; otherwise consume against today's bucket.
        //
        // CRITICAL: rejection is a revert, never a return value. CopyVault catches it and logs
        // MirrorRejected(reason) (v2.2 §7.1), and Patrick's banner decodes the selector out of
        // those bytes. A silent success would leave the demo nothing to show.
        user;
        agentId;
        token;
        notional;
        isBuy;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function kill(address user, uint256 agentId) external onlyVault {
        // TODO: set active = false and emit PolicyKilled, but only when the follow is active;
        // never revert for the vault (D2) — this call sits on the follower's exit path.
        user;
        agentId;
        revert NotImplemented();
    }

    /// @inheritdoc IPolicyModule
    function setTokenAllowlist(address token, bool allowed) external onlyOwner {
        // TODO: _tokenAllowlist[token] = allowed;
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
