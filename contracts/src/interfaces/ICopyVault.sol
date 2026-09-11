// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICopyVault
/// @notice Frozen ABI — PRD Section 4.4. Implementation owner: Jason.
/// @dev This interface is published here so the Day-3 freeze covers all of Section 4 in one
///      place and the frontend has a single import path. The CopyVault.sol implementation is
///      Jason's deliverable — do not implement it in this repo lane without a team sync.
///
///      Build order inside CopyVault (PRD Section 4.4): (1) deposit/withdraw with reentrancy
///      guard + passing drain-beyond-cap test, shipped alone first; (2) follow/unfollow against
///      a single follower per agent; (3) only once (1) and (2) are green, extend mirrorFill to
///      loop multiple followers pro-rata.
interface ICopyVault {
    event Deposited(address indexed user, uint256 amount);
    event Followed(address indexed user, uint256 indexed agentId, uint256 cap);
    event Mirrored(address indexed user, uint256 indexed agentId, uint256 indexed fillId, uint256 size, bool isBuy);
    event Unfollowed(address indexed user, uint256 indexed agentId, uint256 returnedAmount);
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice UI copy: "You don't have enough free balance in the vault for that."
    error InsufficientBalance();
    error AlreadyFollowing();
    error NotFollowing();

    /// @dev nonReentrant, SafeERC20.safeTransferFrom
    function deposit(uint256 amount) external;

    function follow(uint256 agentId, uint256 capAmount, uint256 maxSlippageBps) external;

    /// @dev onlyRunner, nonReentrant — loops followers
    function mirrorFill(uint256 agentId, uint256 fillId) external;

    /// @dev calls PolicyModule.kill, returns allocation
    function unfollow(uint256 agentId) external;

    /// @dev nonReentrant, SafeERC20.safeTransfer
    function withdraw(uint256 amount) external;

    function balanceOf(address user) external view returns (uint256 free);

    function allocationOf(address user, uint256 agentId) external view returns (uint256);

    function followersOf(uint256 agentId) external view returns (address[] memory);
}
