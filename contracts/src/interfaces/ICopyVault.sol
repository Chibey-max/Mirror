// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICopyVault
/// @notice PRD v2.2 Section 7.7. Implementation owner: Jason.
/// @dev Build custody first, then single-follower policies, then independent multi-follower
///      virtual positions. Principal is returned unchanged; simulated PnL is not withdrawable.
interface ICopyVault {
    event Deposited(address indexed user, uint256 amount);
    event Followed(address indexed user, uint256 indexed agentId, uint256 cap);
    event Mirrored(address indexed user, uint256 indexed agentId, uint256 indexed fillId, uint256 size, bool isBuy);
    event MirrorRejected(address indexed user, uint256 indexed agentId, uint256 indexed fillId, bytes reason);
    event Unfollowed(address indexed user, uint256 indexed agentId, uint256 returnedAmount);
    event Withdrawn(address indexed user, uint256 amount);

    /// @notice UI copy: "You don't have enough free balance in the vault for that."
    error InsufficientBalance();
    error AlreadyFollowing();
    error NotFollowing();
    error ZeroRunner();
    /// @notice Dependency address is zero or has no contract code.
    error ZeroTrackRecord();
    error ZeroPolicyModule();
    error ZeroUsdg();
    error FollowerLimitReached(uint256 agentId);
    error AgentNotFound(uint256 agentId);
    error AgentInactive(uint256 agentId);
    error FillNotFound(uint256 fillId);
    error FillAlreadyMirrored(uint256 fillId);

    /// @dev nonReentrant, SafeERC20.safeTransferFrom
    function deposit(uint256 amount) external;

    function follow(uint256 agentId, uint256 capAmount, uint256 maxSlippageBps) external;

    /// @dev onlyRunner, nonReentrant — loops followers
    function mirrorFill(uint256 fillId) external;

    /// @dev calls PolicyModule.kill, returns principal only
    function unfollow(uint256 agentId) external;

    /// @dev nonReentrant, SafeERC20.safeTransfer
    function withdraw(uint256 amount) external;

    function balanceOf(address user) external view returns (uint256 free);

    /// @notice Principal committed to this follow, not its current position value.
    function allocationOf(address user, uint256 agentId) external view returns (uint256);

    function positionOf(address user, uint256 agentId, address token) external view returns (uint256);

    function followersOf(uint256 agentId) external view returns (address[] memory);

    function followerCountOf(uint256 agentId) external view returns (uint256);

    function isMirrored(uint256 fillId) external view returns (bool);
}
