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
    /// @dev Called by CopyVault.follow. A plain overwrite: CopyVault rejects a second follow with
    ///      AlreadyFollowing, so the only way here twice is a re-follow after unfollow.
    ///
    ///      Today's spend is deliberately NOT cleared (D4). It is keyed by (user, agent, day), not
    ///      by follow, so unfollowing and following again on the same UTC day cannot hand the agent
    ///      a fresh cap, and lowering the cap cannot forgive what has already been spent.
    ///
    ///      No validation: the vault is the only caller, and the numbers are the follower's own.
    ///      A zero cap simply rejects every buy, and maxSlippageBps is not enforced at all (§9).
    function setPolicy(address user, uint256 agentId, uint256 maxNotionalPerDay, uint256 maxSlippageBps)
        external
        onlyVault
    {
        _policies[user][agentId] = Policy(maxNotionalPerDay, maxSlippageBps, true);
        emit PolicySet(user, agentId, maxNotionalPerDay, maxSlippageBps);
    }

    /// @inheritdoc IPolicyModule
    /// @dev The gate CopyVault runs once per follower per fill, inside a try/catch. Rejection is a
    ///      revert, never a return value: CopyVault catches it and logs MirrorRejected(reason)
    ///      (§7.1), and the frontend decodes the selector out of those bytes. Every path below
    ///      therefore ends in one of the four declared errors — never a Panic, which would reach
    ///      the banner as undecodable bytes.
    ///
    ///      Order matters. `active` is checked first so a killed follow is told it is dead rather
    ///      than blamed on the token, and it rejects sells as well as buys (§7.5). Only buys reach
    ///      the cap: the cap exists to limit risk added, not to block a follower from getting out.
    function checkAndConsume(address user, uint256 agentId, address token, uint256 notional, bool isBuy)
        external
        onlyVault
    {
        Policy storage p = _policies[user][agentId];
        if (!p.active) revert PolicyInactive();
        if (!_tokenAllowlist[token]) revert TokenNotAllowed(token);
        if (!isBuy) return;

        uint256 cap = p.maxNotionalPerDay;
        uint256 day = block.timestamp / 1 days; // 00:00 UTC, 08:00 SGT (§7.6)
        uint256 spent = _spentOnDay[user][agentId][day];

        // Compare against the headroom rather than adding first. `spent + notional` can only
        // overflow with absurd values, but an overflow here would be Panic(0x11), and the vault
        // would log bytes the banner cannot read. Saturating keeps the answer a real rejection.
        if (notional > type(uint256).max - spent) revert CapExceeded(type(uint256).max, cap);

        uint256 attempted = spent + notional; // the running total the banner quotes (§7.6)
        if (attempted > cap) revert CapExceeded(attempted, cap);

        _spentOnDay[user][agentId][day] = attempted;
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
    /// @dev The owner's only power. Removing a token stops mirrors of it in both directions from
    ///      the next call onward; it cannot touch a cap, today's spend, an active flag or anyone's
    ///      principal, which CopyVault returns in full regardless (§7.3).
    function setTokenAllowlist(address token, bool allowed) external onlyOwner {
        _tokenAllowlist[token] = allowed;
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
