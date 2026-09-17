// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";

/// @title TrackRecordHandler
/// @notice Drives random sequences of fills (valid and invalid), refused callers, agent registrations,
///         deactivations and forward time jumps, and keeps a ghost model of what the ledger should hold.
///
/// @dev Every call's outcome is compared against the model INSIDE the handler, and a disagreement is
///      recorded in `unexpectedOutcomes` rather than asserted. With fail_on_revert off, an assertion
///      that reverts inside a handler call is silently discarded, so the count is checked by an
///      invariant instead.
contract TrackRecordHandler is Test {
    AgentRegistry public immutable registry;
    TrackRecord public immutable trackRecord;
    address public immutable runner;

    address[] internal _owners;
    address[] internal _strangers;

    /// @dev fillId => keccak256(abi.encode(getFill(fillId))) taken right after it was recorded.
    mapping(uint256 => bytes32) public snapshotOf;
    /// @dev agentId => fillIds the model expects, in recording order.
    mapping(uint256 => uint256[]) internal _modelByAgent;

    uint256 public modelFillCount;
    uint256 public unexpectedOutcomes;

    constructor(AgentRegistry registry_, TrackRecord trackRecord_, address runner_) {
        registry = registry_;
        trackRecord = trackRecord_;
        runner = runner_;
        for (uint256 i = 0; i < 2; i++) {
            _owners.push(address(uint160(0x0A11 + i)));
            _strangers.push(address(uint160(0x5714 + i)));
        }
    }

    function modelFillsOf(uint256 agentId) external view returns (uint256[] memory) {
        return _modelByAgent[agentId];
    }

    function registerAgent(uint256 ownerSeed, uint32 secondsLater) external {
        vm.warp(block.timestamp + secondsLater);
        vm.prank(_owners[ownerSeed % _owners.length]);
        registry.registerAgent("agent", keccak256("strategy"), "v1");
    }

    /// @dev Deactivation's own rules are AgentRegistry's to test; here it only changes which fills are refused.
    function deactivateAgent(uint256 agentIdSeed) external {
        uint256 count = registry.agentCount();
        if (count == 0) return;
        uint256 agentId = agentIdSeed % count + 1;
        IAgentRegistry.Agent memory agent = registry.getAgent(agentId);
        if (!agent.active) return;

        vm.prank(agent.owner);
        registry.deactivateAgent(agentId);
    }

    /// @dev Targets agent ids 0..agentCount+1, so id 0 and an unregistered id are both exercised. About
    ///      3 in 8 calls carry a zero token, size or price.
    function recordFill(uint256 agentIdSeed, uint256 valueSeed, bytes32 roundId, uint8 zeroSeed, uint32 secondsLater)
        external
    {
        vm.warp(block.timestamp + secondsLater);
        uint256 agentId = agentIdSeed % (registry.agentCount() + 2);

        ITrackRecord.Fill memory intended = _intendedFill(agentId, valueSeed, roundId, zeroSeed);
        bytes memory expectedRevert = _expectedRevert(intended);

        vm.prank(runner);
        try trackRecord.recordFill(
            agentId, intended.token, intended.isBuy, intended.size, intended.price, intended.oracleRoundId
        ) returns (
            uint256 fillId
        ) {
            if (expectedRevert.length != 0) unexpectedOutcomes++;
            _recordSuccess(fillId, intended);
        } catch (bytes memory reason) {
            if (expectedRevert.length == 0 || keccak256(reason) != keccak256(expectedRevert)) unexpectedOutcomes++;
        }
    }

    function recordFillAsStranger(uint256 strangerSeed, uint256 agentIdSeed) external {
        uint256 agentId = agentIdSeed % (registry.agentCount() + 2);

        vm.prank(_strangers[strangerSeed % _strangers.length]);
        try trackRecord.recordFill(agentId, address(0xC0FFEE), true, 1, 1, bytes32(uint256(1))) {
            unexpectedOutcomes++;
        } catch (bytes memory reason) {
            if (keccak256(reason) != keccak256(abi.encodeWithSelector(ITrackRecord.NotRunner.selector))) {
                unexpectedOutcomes++;
            }
        }
    }

    function _intendedFill(uint256 agentId, uint256 valueSeed, bytes32 roundId, uint8 zeroSeed)
        internal
        view
        returns (ITrackRecord.Fill memory f)
    {
        f.agentId = agentId;
        f.token = address(uint160(uint256(keccak256(abi.encode(valueSeed, "token"))) % 3 + 1));
        f.isBuy = valueSeed % 2 == 0;
        f.size = bound(uint256(keccak256(abi.encode(valueSeed, "size"))), 1, type(uint256).max);
        f.price = bound(uint256(keccak256(abi.encode(valueSeed, "price"))), 1, type(uint256).max);
        f.timestamp = uint64(block.timestamp);
        f.oracleRoundId = roundId;

        uint8 zero = zeroSeed % 8;
        if (zero == 1) f.token = address(0);
        if (zero == 2) f.size = 0;
        if (zero == 3) f.price = 0;
    }

    /// @dev The documented check order: values in parameter order, then the agent. Empty means success.
    function _expectedRevert(ITrackRecord.Fill memory f) internal view returns (bytes memory) {
        if (f.token == address(0)) return abi.encodeWithSelector(ITrackRecord.ZeroToken.selector);
        if (f.size == 0) return abi.encodeWithSelector(ITrackRecord.ZeroSize.selector);
        if (f.price == 0) return abi.encodeWithSelector(ITrackRecord.ZeroPrice.selector);

        IAgentRegistry.Agent memory agent = registry.getAgent(f.agentId);
        if (agent.owner == address(0)) return abi.encodeWithSelector(ITrackRecord.AgentNotFound.selector, f.agentId);
        if (!agent.active) return abi.encodeWithSelector(ITrackRecord.AgentInactive.selector, f.agentId);
        return "";
    }

    function _recordSuccess(uint256 fillId, ITrackRecord.Fill memory intended) internal {
        if (fillId != modelFillCount + 1) unexpectedOutcomes++;

        intended.fillId = fillId;
        ITrackRecord.Fill memory stored = trackRecord.getFill(fillId);
        if (keccak256(abi.encode(stored)) != keccak256(abi.encode(intended))) unexpectedOutcomes++;

        modelFillCount = fillId;
        snapshotOf[fillId] = keccak256(abi.encode(stored));
        _modelByAgent[intended.agentId].push(fillId);
    }
}

/// @title TrackRecordInvariantTest
/// @notice Properties that must hold after ANY sequence of fills, refused calls, registrations,
///         deactivations and time jumps. Owner: Isaac.
///
/// @dev The product's first claim as an invariant: a recorded fill is byte-identical forever.
///
/// @dev Campaigns are capped at 128 runs x 64 calls. The ledger invariants walk every fill after every
///      call, so cost grows with depth squared (the same reason AgentRegistryInvariant is capped).
contract TrackRecordInvariantTest is Test {
    AgentRegistry internal registry;
    TrackRecord internal trackRecord;
    TrackRecordHandler internal handler;

    function setUp() public {
        address runner = makeAddr("runner");
        registry = new AgentRegistry();
        trackRecord = new TrackRecord(address(registry), runner);
        handler = new TrackRecordHandler(registry, trackRecord, runner);
        vm.warp(1_789_000_000);

        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = TrackRecordHandler.registerAgent.selector;
        selectors[1] = TrackRecordHandler.deactivateAgent.selector;
        selectors[2] = TrackRecordHandler.recordFill.selector;
        selectors[3] = TrackRecordHandler.recordFillAsStranger.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
        targetContract(address(handler));
    }

    /// @dev Every call succeeded or reverted exactly as the model predicted, and every fill was stored
    ///      exactly as sent, with the contract's own fillId and block time.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_EveryCallMatchesTheModel() public view {
        assertEq(handler.unexpectedOutcomes(), 0, "a call's outcome disagreed with the model");
    }

    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_FillCountEqualsSuccessfulRecords() public view {
        assertEq(trackRecord.fillCount(), handler.modelFillCount());

        uint256 agents = registry.agentCount();
        uint256 sum;
        for (uint256 agentId = 0; agentId <= agents + 1; agentId++) {
            sum += trackRecord.fillCountByAgent(agentId);
        }
        assertEq(sum, trackRecord.fillCount(), "per-agent counts do not add up to fillCount");
    }

    /// @dev Append-only: every recorded fill still hashes to its snapshot from the moment it was
    ///      recorded, keeps its id, and was recorded no earlier than its agent was registered.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_RecordedFillsNeverChange() public view {
        uint256 count = trackRecord.fillCount();
        for (uint256 fillId = 1; fillId <= count; fillId++) {
            ITrackRecord.Fill memory f = trackRecord.getFill(fillId);
            assertEq(keccak256(abi.encode(f)), handler.snapshotOf(fillId), "a recorded fill changed");
            assertEq(f.fillId, fillId, "a fill's id changed");
            assertGe(f.timestamp, registry.getAgent(f.agentId).registeredAt, "a fill predates its agent");
        }
    }

    /// @dev Each agent's tape is exactly its own fills, oldest first, and matches its count.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_EachAgentsTapeIsExact() public view {
        uint256 agents = registry.agentCount();
        for (uint256 agentId = 1; agentId <= agents; agentId++) {
            uint256[] memory expected = handler.modelFillsOf(agentId);
            ITrackRecord.Fill[] memory tape = trackRecord.getFillsByAgent(agentId, 0, type(uint256).max);

            assertEq(tape.length, expected.length, "tape length differs from the model");
            assertEq(trackRecord.fillCountByAgent(agentId), expected.length, "fillCountByAgent differs");
            for (uint256 i = 0; i < tape.length; i++) {
                assertEq(tape[i].fillId, expected[i], "tape order or content differs from the model");
                assertEq(tape[i].agentId, agentId, "another agent's fill is on this tape");
            }
        }
    }

    /// @dev Id 0 and the first unrecorded id read as the all-zero Fill: CopyVault's FillNotFound check.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 64
    function invariant_UnrecordedIdsReadAsZero() public view {
        bytes32 zeroFill = keccak256(abi.encode(ITrackRecord.Fill(0, 0, address(0), false, 0, 0, 0, bytes32(0))));
        assertEq(keccak256(abi.encode(trackRecord.getFill(0))), zeroFill, "id 0 holds a fill");
        assertEq(
            keccak256(abi.encode(trackRecord.getFill(trackRecord.fillCount() + 1))),
            zeroFill,
            "an id past fillCount holds a fill"
        );
    }
}
