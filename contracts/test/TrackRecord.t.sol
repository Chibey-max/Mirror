// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrackRecord} from "../src/TrackRecord.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";
import {ITrackRecord} from "../src/interfaces/ITrackRecord.sol";

/// @title TrackRecordTest
/// @notice Behaviour of TrackRecord — PRD v2.2 Section 5.2. Owner: Isaac.
///
/// @dev TrackRecord is the tape: the record of what each agent did. These tests pin what its
///      consumers rely on:
///        - it is wired at construction to a real AgentRegistry and a non-zero runner, and neither
///          can change afterwards;
///        - only the runner can record, and only for an agent that exists and is active;
///        - a fill with a zero token, size or price never reaches the tape, and the checks run in a
///          fixed order: caller, then values, then agent;
///        - fillIds run 1, 2, 3... across all agents; unrecorded ids, including 0, read as the zero
///          struct without reverting, because CopyVault's FillNotFound check (PRD v2.2 Section 7.4)
///          is `getFill(fillId).fillId == 0`;
///        - every stored field is exactly what the runner sent, plus the contract's own fillId and
///          block timestamp, and exactly one FillRecorded carries the same values;
///        - deactivating an agent stops new fills and leaves its recorded fills untouched;
///        - getFillsByAgent returns an agent's own fills oldest first, and never reverts for any offset
///          or limit, because the AgentTapeTable pages without knowing the tape's length.
contract TrackRecordTest is Test {
    AgentRegistry internal registry;
    TrackRecord internal trackRecord;

    address internal runner = makeAddr("runner");
    address internal agentOwner = makeAddr("agent-owner");
    address internal stranger = makeAddr("stranger");
    address internal mNVDA = makeAddr("mNVDA");

    // The design mock's sample fill: BUY 0.42 mNVDA @ $128.41 (PRD v2.2 Section 8).
    uint256 internal constant SIZE = 0.42e18;
    uint256 internal constant PRICE = 12_841_000_000;
    bytes32 internal constant ROUND = bytes32(uint256(7));

    function setUp() public {
        registry = new AgentRegistry();
        trackRecord = new TrackRecord(address(registry), runner);
    }

    function _registerAgent(string memory name) internal returns (uint256 agentId) {
        vm.prank(agentOwner);
        agentId = registry.registerAgent(name, keccak256(bytes(name)), "v1");
    }

    /// @dev Records the sample fill for agentId as the runner.
    function _record(uint256 agentId) internal returns (uint256 fillId) {
        vm.prank(runner);
        fillId = trackRecord.recordFill(agentId, mNVDA, true, SIZE, PRICE, ROUND);
    }

    /// @dev Records n fills for agentId with distinct sizes, so pages can be told apart.
    function _recordMany(uint256 agentId, uint256 n) internal {
        vm.startPrank(runner);
        for (uint256 i = 0; i < n; i++) {
            trackRecord.recordFill(agentId, mNVDA, i % 2 == 0, SIZE + i, PRICE, ROUND);
        }
        vm.stopPrank();
    }

    function _assertZeroFill(uint256 fillId) internal view {
        ITrackRecord.Fill memory f = trackRecord.getFill(fillId);
        assertEq(f.fillId, 0, "unrecorded id has a fillId");
        assertEq(f.agentId, 0, "unrecorded id has an agentId");
        assertEq(f.token, address(0), "unrecorded id has a token");
        assertFalse(f.isBuy, "unrecorded id has a side");
        assertEq(f.size, 0, "unrecorded id has a size");
        assertEq(f.price, 0, "unrecorded id has a price");
        assertEq(f.timestamp, 0, "unrecorded id has a timestamp");
        assertEq(f.oracleRoundId, bytes32(0), "unrecorded id has an oracleRoundId");
    }

    // ---------------------------------------------------------------------------------------------
    // constructor
    // ---------------------------------------------------------------------------------------------

    function test_Constructor_StoresRegistryAndRunner() public view {
        assertEq(address(trackRecord.registry()), address(registry), "registry not set from constructor");
        assertEq(trackRecord.runner(), runner, "runner not set from constructor");
    }

    function test_Constructor_RejectsZeroRegistry() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(address(0), runner);
    }

    /// @dev A mistyped registry address, or one copied from the other chain's deployments file,
    ///      has no code. Without this check it deploys fine and every recordFill later reverts
    ///      with empty revert data.
    function test_Constructor_RejectsRegistryWithNoCode() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(makeAddr("not-a-registry"), runner);
    }

    /// @dev With the runner as a plain wallet, swapping the two arguments leaves a codeless address
    ///      in the registry slot, so it is caught at deploy. A swap between two contract addresses
    ///      is not caught here; the deploy script's read-backs of registry() and runner() cover it.
    function test_Constructor_RejectsSwappedArguments() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(runner, address(registry));
    }

    function test_Constructor_RejectsZeroRunner() public {
        vm.expectRevert(TrackRecord.ZeroRunner.selector);
        new TrackRecord(address(registry), address(0));
    }

    /// @dev PRD v2.2 Section 5.2 checks the registry first, so a deploy with both arguments wrong
    ///      reports the registry.
    function test_Constructor_ChecksRegistryBeforeRunner() public {
        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(address(0), address(0));
    }

    function testFuzz_Constructor_RejectsAnyRegistryWithNoCode(address candidate) public {
        vm.assume(candidate.code.length == 0);

        vm.expectRevert(TrackRecord.ZeroRegistry.selector);
        new TrackRecord(candidate, runner);
    }

    // ---------------------------------------------------------------------------------------------
    // a fresh ledger
    // ---------------------------------------------------------------------------------------------

    function test_FreshLedger_ReadsAsEmptyWithoutReverting() public view {
        assertEq(trackRecord.fillCount(), 0, "fresh ledger has fills");

        uint256[3] memory agentIds = [uint256(0), 1, type(uint256).max];
        for (uint256 i = 0; i < agentIds.length; i++) {
            assertEq(trackRecord.fillCountByAgent(agentIds[i]), 0, "fresh ledger has a per-agent fill");
        }

        ITrackRecord.Fill memory f = trackRecord.getFill(1);
        assertEq(f.fillId, 0, "an unrecorded fillId must read as fillId 0");
    }

    // ---------------------------------------------------------------------------------------------
    // errors shared with AgentRegistry
    // ---------------------------------------------------------------------------------------------

    /// @dev One ABI entry decodes AgentInactive from either contract.
    function test_AgentInactiveSharesItsSelectorWithAgentRegistry() public pure {
        assertEq(ITrackRecord.AgentInactive.selector, IAgentRegistry.AgentInactive.selector);
    }

    // ---------------------------------------------------------------------------------------------
    // recordFill: what gets written
    // ---------------------------------------------------------------------------------------------

    function test_RecordFill_FirstFillIdIsOne() public {
        uint256 pulse = _registerAgent("Pulse");

        assertEq(_record(pulse), 1, "first fillId must be 1 - id 0 is reserved as 'no fill'");
        assertEq(trackRecord.fillCount(), 1);
        assertEq(trackRecord.fillCountByAgent(pulse), 1);
    }

    function test_RecordFill_IdsAreGlobalAndSequentialAcrossAgents() public {
        uint256 pulse = _registerAgent("Pulse");
        uint256 red = _registerAgent("Red");

        assertEq(_record(pulse), 1);
        assertEq(_record(red), 2);
        assertEq(_record(pulse), 3);

        assertEq(trackRecord.fillCount(), 3);
        assertEq(trackRecord.fillCountByAgent(pulse), 2);
        assertEq(trackRecord.fillCountByAgent(red), 1);
        assertEq(trackRecord.getFill(2).agentId, red, "fill 2 belongs to Red");
    }

    function test_RecordFill_StoresEveryFieldAndTheBlockTime() public {
        uint256 pulse = _registerAgent("Pulse");

        vm.warp(1_789_000_000);
        vm.prank(runner);
        uint256 fillId = trackRecord.recordFill(pulse, mNVDA, false, SIZE, PRICE, ROUND);

        ITrackRecord.Fill memory f = trackRecord.getFill(fillId);
        assertEq(f.fillId, fillId, "stored fillId must equal the returned one");
        assertEq(f.agentId, pulse);
        assertEq(f.token, mNVDA);
        assertFalse(f.isBuy);
        assertEq(f.size, SIZE);
        assertEq(f.price, PRICE);
        assertEq(f.timestamp, 1_789_000_000, "timestamp must be the recording block's time");
        assertEq(f.oracleRoundId, ROUND);

        vm.warp(1_789_000_060);
        assertEq(trackRecord.getFill(_record(pulse)).timestamp, 1_789_000_060, "each fill takes its own block time");
    }

    /// @dev vm.recordLogs, not expectEmit, so a duplicate event would fail the count.
    function test_RecordFill_EmitsExactlyOneEventMatchingTheStoredFill() public {
        uint256 pulse = _registerAgent("Pulse");
        vm.warp(1_789_000_000);

        vm.recordLogs();
        uint256 fillId = _record(pulse);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1, "recordFill must emit exactly one log");
        assertEq(logs[0].emitter, address(trackRecord));
        assertEq(logs[0].topics.length, 4, "FillRecorded has three indexed parameters");
        assertEq(logs[0].topics[0], ITrackRecord.FillRecorded.selector);

        ITrackRecord.Fill memory f = trackRecord.getFill(fillId);
        assertEq(uint256(logs[0].topics[1]), f.fillId, "event fillId must equal the stored and returned fillId");
        assertEq(uint256(logs[0].topics[2]), f.agentId);
        assertEq(logs[0].topics[3], bytes32(uint256(uint160(f.token))));
        assertEq(logs[0].data, abi.encode(f.isBuy, f.size, f.price, f.timestamp, f.oracleRoundId));
    }

    function test_RecordFill_UnrecordedIdsStillReadAsZero() public {
        uint256 pulse = _registerAgent("Pulse");
        _record(pulse);
        _record(pulse);

        _assertZeroFill(0);
        _assertZeroFill(3);
        _assertZeroFill(type(uint256).max);
    }

    function testFuzz_RecordFill_StoresAnyValidFillExactly(
        address token,
        bool isBuy,
        uint256 size,
        uint256 price,
        bytes32 roundId,
        uint256 when
    ) public {
        vm.assume(token != address(0));
        size = bound(size, 1, type(uint256).max);
        price = bound(price, 1, type(uint256).max);
        when = bound(when, block.timestamp, type(uint64).max);
        uint256 pulse = _registerAgent("Pulse");

        vm.warp(when);
        vm.prank(runner);
        uint256 fillId = trackRecord.recordFill(pulse, token, isBuy, size, price, roundId);

        ITrackRecord.Fill memory f = trackRecord.getFill(fillId);
        assertEq(f.fillId, fillId);
        assertEq(f.agentId, pulse);
        assertEq(f.token, token);
        assertEq(f.isBuy, isBuy);
        assertEq(f.size, size);
        assertEq(f.price, price);
        assertEq(f.timestamp, when);
        assertEq(f.oracleRoundId, roundId);
    }

    // ---------------------------------------------------------------------------------------------
    // recordFill: who and what is refused
    // ---------------------------------------------------------------------------------------------

    function testFuzz_RecordFill_OnlyTheRunnerCanRecord(address caller) public {
        vm.assume(caller != runner);
        uint256 pulse = _registerAgent("Pulse");

        vm.prank(caller);
        vm.expectRevert(ITrackRecord.NotRunner.selector);
        trackRecord.recordFill(pulse, mNVDA, true, SIZE, PRICE, ROUND);

        assertEq(trackRecord.fillCount(), 0, "a refused caller moved fillCount");
    }

    function test_RecordFill_RevertsForAgentsThatDoNotExist() public {
        uint256 pulse = _registerAgent("Pulse");
        _record(pulse);

        uint256[3] memory unknown = [uint256(0), pulse + 1, type(uint256).max];
        vm.startPrank(runner);
        for (uint256 i = 0; i < unknown.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentNotFound.selector, unknown[i]));
            trackRecord.recordFill(unknown[i], mNVDA, true, SIZE, PRICE, ROUND);
        }
        vm.stopPrank();

        assertEq(trackRecord.fillCount(), 1, "a refused fill moved fillCount");
        _assertZeroFill(2);
    }

    function test_RecordFill_RevertsForADeactivatedAgent() public {
        uint256 pulse = _registerAgent("Pulse");
        vm.prank(agentOwner);
        registry.deactivateAgent(pulse);

        vm.prank(runner);
        vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentInactive.selector, pulse));
        trackRecord.recordFill(pulse, mNVDA, true, SIZE, PRICE, ROUND);

        assertEq(trackRecord.fillCount(), 0);
        assertEq(trackRecord.fillCountByAgent(pulse), 0);
    }

    function test_RecordFill_RejectsAZeroToken() public {
        uint256 pulse = _registerAgent("Pulse");

        vm.prank(runner);
        vm.expectRevert(ITrackRecord.ZeroToken.selector);
        trackRecord.recordFill(pulse, address(0), true, SIZE, PRICE, ROUND);

        assertEq(trackRecord.fillCount(), 0);
    }

    function test_RecordFill_RejectsAZeroSize() public {
        uint256 pulse = _registerAgent("Pulse");

        vm.prank(runner);
        vm.expectRevert(ITrackRecord.ZeroSize.selector);
        trackRecord.recordFill(pulse, mNVDA, true, 0, PRICE, ROUND);

        assertEq(trackRecord.fillCount(), 0);
    }

    /// @dev A zero price has zero notional under PRD v2.2 Section 8, so on a buy it would pass every
    ///      follower's cap. It must never reach the tape.
    function test_RecordFill_RejectsAZeroPrice() public {
        uint256 pulse = _registerAgent("Pulse");

        vm.prank(runner);
        vm.expectRevert(ITrackRecord.ZeroPrice.selector);
        trackRecord.recordFill(pulse, mNVDA, true, SIZE, 0, ROUND);

        assertEq(trackRecord.fillCount(), 0);
    }

    /// @dev Caller first, then the three values in parameter order, then the agent. Each call below
    ///      is wrong in every later check too, so only this order produces these errors.
    function test_RecordFill_ChecksRunInTheDocumentedOrder() public {
        uint256 unknown = 99;

        vm.prank(stranger);
        vm.expectRevert(ITrackRecord.NotRunner.selector);
        trackRecord.recordFill(unknown, address(0), true, 0, 0, ROUND);

        vm.startPrank(runner);
        vm.expectRevert(ITrackRecord.ZeroToken.selector);
        trackRecord.recordFill(unknown, address(0), true, 0, 0, ROUND);

        vm.expectRevert(ITrackRecord.ZeroSize.selector);
        trackRecord.recordFill(unknown, mNVDA, true, 0, 0, ROUND);

        vm.expectRevert(ITrackRecord.ZeroPrice.selector);
        trackRecord.recordFill(unknown, mNVDA, true, SIZE, 0, ROUND);

        vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentNotFound.selector, unknown));
        trackRecord.recordFill(unknown, mNVDA, true, SIZE, PRICE, ROUND);
        vm.stopPrank();
    }

    function test_RecordFill_ReadsTheRegistryExactlyOnce() public {
        uint256 pulse = _registerAgent("Pulse");

        vm.expectCall(address(registry), abi.encodeWithSelector(IAgentRegistry.getAgent.selector), 1);
        _record(pulse);
    }

    /// @dev A refused caller or a zero value is rejected before the registry is touched.
    function test_RecordFill_EarlyRejectionsNeverReachTheRegistry() public {
        uint256 pulse = _registerAgent("Pulse");
        vm.expectCall(address(registry), abi.encodeWithSelector(IAgentRegistry.getAgent.selector), 0);

        vm.prank(stranger);
        vm.expectRevert(ITrackRecord.NotRunner.selector);
        trackRecord.recordFill(pulse, mNVDA, true, SIZE, PRICE, ROUND);

        vm.startPrank(runner);
        vm.expectRevert(ITrackRecord.ZeroToken.selector);
        trackRecord.recordFill(pulse, address(0), true, SIZE, PRICE, ROUND);
        vm.expectRevert(ITrackRecord.ZeroSize.selector);
        trackRecord.recordFill(pulse, mNVDA, true, 0, PRICE, ROUND);
        vm.expectRevert(ITrackRecord.ZeroPrice.selector);
        trackRecord.recordFill(pulse, mNVDA, true, SIZE, 0, ROUND);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------------------------------
    // recordFill: deactivation hides nothing
    // ---------------------------------------------------------------------------------------------

    function test_RecordFill_DeactivationStopsNewFillsButKeepsHistory() public {
        uint256 pulse = _registerAgent("Pulse");
        uint256 red = _registerAgent("Red");
        uint256 first = _record(pulse);
        uint256 redFill = _record(red);
        uint256 second = _record(pulse);

        bytes memory firstBefore = abi.encode(trackRecord.getFill(first));
        bytes memory secondBefore = abi.encode(trackRecord.getFill(second));
        bytes memory redBefore = abi.encode(trackRecord.getFill(redFill));

        vm.prank(agentOwner);
        registry.deactivateAgent(pulse);

        vm.prank(runner);
        vm.expectRevert(abi.encodeWithSelector(ITrackRecord.AgentInactive.selector, pulse));
        trackRecord.recordFill(pulse, mNVDA, true, SIZE, PRICE, ROUND);

        assertEq(abi.encode(trackRecord.getFill(first)), firstBefore, "a recorded fill changed after deactivation");
        assertEq(abi.encode(trackRecord.getFill(second)), secondBefore, "a recorded fill changed after deactivation");
        assertEq(abi.encode(trackRecord.getFill(redFill)), redBefore, "another agent's fill changed");
        assertEq(trackRecord.fillCountByAgent(pulse), 2, "deactivation hid part of the history");
        assertEq(trackRecord.fillCount(), 3);

        assertEq(_record(red), 4, "other agents keep recording");
    }

    // ---------------------------------------------------------------------------------------------
    // getFillsByAgent
    // ---------------------------------------------------------------------------------------------

    function test_GetFillsByAgent_IsEmptyForAnAgentWithNoFills() public {
        uint256 pulse = _registerAgent("Pulse");
        uint256 red = _registerAgent("Red");
        _recordMany(red, 2);

        assertEq(trackRecord.getFillsByAgent(pulse, 0, 10).length, 0, "registered agent with no fills");
        assertEq(trackRecord.getFillsByAgent(0, 0, 10).length, 0, "agent id 0");
        assertEq(trackRecord.getFillsByAgent(type(uint256).max, 0, 10).length, 0, "unknown agent id");
    }

    function test_GetFillsByAgent_ReturnsOnlyThatAgentsFillsOldestFirst() public {
        uint256 pulse = _registerAgent("Pulse");
        uint256 red = _registerAgent("Red");
        _record(pulse); // 1
        _record(red); // 2
        _record(pulse); // 3
        _record(red); // 4
        _record(pulse); // 5

        ITrackRecord.Fill[] memory page = trackRecord.getFillsByAgent(pulse, 0, 10);

        assertEq(page.length, 3);
        uint256[3] memory expected = [uint256(1), 3, 5];
        for (uint256 i = 0; i < page.length; i++) {
            assertEq(page[i].fillId, expected[i], "wrong fill or wrong order");
            assertEq(abi.encode(page[i]), abi.encode(trackRecord.getFill(expected[i])), "page differs from getFill");
        }
    }

    /// @dev The table of cases a blind pager can send. None may revert.
    function test_GetFillsByAgent_NeverRevertsOnOutOfRangeArguments() public {
        uint256 pulse = _registerAgent("Pulse");
        _recordMany(pulse, 3);
        uint256 max = type(uint256).max;

        assertEq(trackRecord.getFillsByAgent(pulse, 0, 0).length, 0, "limit 0");
        assertEq(trackRecord.getFillsByAgent(pulse, 3, 1).length, 0, "offset == count");
        assertEq(trackRecord.getFillsByAgent(pulse, 4, 1).length, 0, "offset past the end");
        assertEq(trackRecord.getFillsByAgent(pulse, max, 1).length, 0, "offset max");
        assertEq(trackRecord.getFillsByAgent(pulse, max, max).length, 0, "offset and limit max");
        assertEq(trackRecord.getFillsByAgent(pulse, 0, max).length, 3, "limit max from the start");
        assertEq(trackRecord.getFillsByAgent(pulse, 1, max).length, 2, "limit max would overflow offset + limit");
        assertEq(trackRecord.getFillsByAgent(pulse, 2, 5).length, 1, "limit past the end");
    }

    function test_GetFillsByAgent_PagesTileTheWholeTape() public {
        uint256 pulse = _registerAgent("Pulse");
        _recordMany(pulse, 7);

        ITrackRecord.Fill[] memory whole = trackRecord.getFillsByAgent(pulse, 0, 7);
        uint256 seen;
        for (uint256 offset = 0; offset < 7; offset += 3) {
            ITrackRecord.Fill[] memory page = trackRecord.getFillsByAgent(pulse, offset, 3);
            for (uint256 i = 0; i < page.length; i++) {
                assertEq(abi.encode(page[i]), abi.encode(whole[seen]), "pages do not tile the tape");
                seen++;
            }
        }
        assertEq(seen, 7, "pages skipped or repeated a fill");
        assertEq(trackRecord.getFillsByAgent(pulse, 9, 3).length, 0, "the page after the last is empty");
    }

    /// @dev Two agents with interleaved fills, any offset and limit in the full uint256 range: the page is
    ///      exactly the model's slice. The model is the spec: empty if offset >= count, otherwise
    ///      min(limit, count - offset) fills starting at offset.
    function testFuzz_GetFillsByAgent_MatchesTheModelForAnyOffsetAndLimit(
        uint8 fills,
        uint256 ownerBits,
        uint256 offset,
        uint256 limit,
        uint8 mode
    ) public {
        fills = uint8(bound(fills, 0, 24));
        uint256 pulse = _registerAgent("Pulse");
        uint256 red = _registerAgent("Red");

        uint256[] memory model = new uint256[](fills);
        uint256 count;
        for (uint256 i = 0; i < fills; i++) {
            uint256 agentId = (ownerBits >> i) & 1 == 1 ? pulse : red;
            uint256 fillId = _record(agentId);
            if (agentId == pulse) model[count++] = fillId;
        }

        // Mode 0: both near the tape's length, so pages have content. Mode 1: offset inside the tape and
        // limit anywhere in uint256, the case where a naive offset + limit overflows. Mode 2: both unbounded.
        mode = uint8(bound(mode, 0, 2));
        if (mode == 0) {
            offset = bound(offset, 0, count + 2);
            limit = bound(limit, 0, count + 2);
        } else if (mode == 1) {
            offset = bound(offset, 0, count + 2);
        }

        ITrackRecord.Fill[] memory page = trackRecord.getFillsByAgent(pulse, offset, limit);

        uint256 expectedLength = offset >= count ? 0 : (limit < count - offset ? limit : count - offset);
        assertEq(page.length, expectedLength, "page length differs from the model");
        for (uint256 i = 0; i < page.length; i++) {
            assertEq(page[i].fillId, model[offset + i], "page content differs from the model");
            assertEq(page[i].agentId, pulse, "another agent's fill in the page");
        }
        assertEq(trackRecord.fillCountByAgent(pulse), count);
    }
}
