// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICopyVault} from "./interfaces/ICopyVault.sol";
import {ITrackRecord} from "./interfaces/ITrackRecord.sol";
import {IPolicyModule} from "./interfaces/IPolicyModule.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @dev Typed access to TrackRecord's existing immutable getter, without changing its interface.
interface ITrackRecordRegistryReference {
    function registry() external view returns (IAgentRegistry);
}

/// @notice PRD v2.2 custody and principal lifecycle. Mirroring is NOT implemented yet.
/// @dev Not ERC-4626: no shares; balanceOf reports free USDG, principal is tracked separately.
/// @dev Supports the exact-transfer MockUSDG only, not fee-on-transfer or rebasing assets.
///      Direct token donations create surplus, never user credit. No admin withdrawal path.
contract CopyVault is ICopyVault, ReentrancyGuard {
    using SafeERC20 for IERC20;
    error NotImplemented();
    uint256 public constant MAX_FOLLOWERS_PER_AGENT = 50;
    ITrackRecord public immutable trackRecord;
    IPolicyModule public immutable policyModule;
    IERC20 public immutable usdg;
    address public immutable runner;
    mapping(address => uint256) private _free;
    mapping(address => mapping(uint256 => uint256)) private _principal;
    mapping(uint256 => address[]) private _followers;
    // One-based index is also membership: a zero-cap follow is still a follow.
    mapping(uint256 => mapping(address => uint256)) private _followerIndex;
    // Only fills strictly greater than this ID are eligible for the current follow.
    mapping(address => mapping(uint256 => uint256)) internal _followFillBoundary;
    // Logical clearing in O(1): every unfollow ends its position epoch. A later follow
    // cannot inherit old positions, and exit never loops over an unbounded token list.
    mapping(address => mapping(uint256 => uint256)) internal _positionEpoch;
    mapping(address => mapping(uint256 => mapping(uint256 => mapping(address => uint256)))) internal _position;

    constructor(address trackRecord_, address policyModule_, address usdg_, address runner_) {
        if (runner_ == address(0)) revert ZeroRunner();
        if (trackRecord_.code.length == 0) revert ZeroTrackRecord();
        if (policyModule_.code.length == 0) revert ZeroPolicyModule();
        if (usdg_.code.length == 0) revert ZeroUsdg();
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

    function follow(uint256 agentId, uint256 capAmount, uint256 maxSlippageBps) external nonReentrant {
        if (_followerIndex[agentId][msg.sender] != 0) revert AlreadyFollowing();
        if (capAmount > _free[msg.sender]) revert InsufficientBalance();
        if (_followers[agentId].length >= MAX_FOLLOWERS_PER_AGENT) revert FollowerLimitReached(agentId);
        IAgentRegistry.Agent memory agent =
            ITrackRecordRegistryReference(address(trackRecord)).registry().getAgent(agentId);
        if (agent.owner == address(0)) revert AgentNotFound(agentId);
        if (!agent.active) revert AgentInactive(agentId);
        uint256 boundary = trackRecord.fillCount();
        _free[msg.sender] -= capAmount;
        _followFillBoundary[msg.sender][agentId] = boundary;
        _principal[msg.sender][agentId] = capAmount;
        _followers[agentId].push(msg.sender);
        _followerIndex[agentId][msg.sender] = _followers[agentId].length;
        // Failure rolls back principal and membership. The production module must preserve
        // same-day spend on re-follow; this contract never resets policy spend itself.
        policyModule.setPolicy(msg.sender, agentId, capAmount, maxSlippageBps);
        emit Followed(msg.sender, agentId, capAmount);
    }

    function mirrorFill(uint256) external pure {
        revert NotImplemented();
    }

    function unfollow(uint256 agentId) external nonReentrant {
        uint256 index = _followerIndex[agentId][msg.sender];
        if (index == 0) revert NotFollowing();
        uint256 principal = _principal[msg.sender][agentId];
        delete _principal[msg.sender][agentId];
        delete _followFillBoundary[msg.sender][agentId];
        ++_positionEpoch[msg.sender][agentId];
        _free[msg.sender] += principal;
        // Constant-time removal; followersOf ordering is not stable across removals.
        address[] storage followers = _followers[agentId];
        uint256 last = followers.length;
        if (index != last) {
            address moved = followers[last - 1];
            followers[index - 1] = moved;
            _followerIndex[agentId][moved] = index;
        }
        followers.pop();
        delete _followerIndex[agentId][msg.sender];
        // Never swallow a kill failure: policy and vault must transition atomically.
        // Exit liveness depends on the real module's kill behavior; integration is pending.
        policyModule.kill(msg.sender, agentId);
        emit Unfollowed(msg.sender, agentId, principal);
    }

    function allocationOf(address user, uint256 agentId) external view returns (uint256) {
        return _principal[user][agentId];
    }

    function positionOf(address user, uint256 agentId, address token) external view returns (uint256) {
        return _position[user][agentId][_positionEpoch[user][agentId]][token];
    }

    function followersOf(uint256 agentId) external view returns (address[] memory) {
        return _followers[agentId];
    }

    function followerCountOf(uint256 agentId) external view returns (uint256) {
        return _followers[agentId].length;
    }

    function isMirrored(uint256) external pure returns (bool) {
        // No fill can be processed until mirrorFill is implemented.
        return false;
    }
}
