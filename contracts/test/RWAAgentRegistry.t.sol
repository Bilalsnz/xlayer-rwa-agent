// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RWAAgentRegistry} from "../src/RWAAgentRegistry.sol";

contract RWAAgentRegistryTest is Test {
    RWAAgentRegistry reg;
    address agent = address(0xA11CE);
    address voter = address(0xB0B);

    function setUp() public {
        reg = new RWAAgentRegistry();
    }

    function test_RegisterAndLog() public {
        vm.prank(agent);
        reg.registerAgent("ipfs://agent-meta");

        bytes32 id = keccak256("analysis-1");
        vm.prank(agent);
        reg.logAnalysis(
            id, "TSLAx", 60, 70, 40, int8(20), 80, RWAAgentRegistry.Recommendation.BUY, keccak256("json")
        );

        RWAAgentRegistry.Analysis memory a = reg.getAnalysis(id);
        assertEq(a.agent, agent);
        assertEq(uint8(a.recommendation), uint8(RWAAgentRegistry.Recommendation.BUY));
        assertEq(a.confidence, 80);
        assertEq(a.contentHash, keccak256("json"));
    }

    function test_RevertWhen_NotActiveAgent() public {
        vm.prank(agent);
        vm.expectRevert(RWAAgentRegistry.NotActiveAgent.selector);
        reg.logAnalysis(
            keccak256("x"), "AAPLx", 1, 1, 1, int8(0), 1, RWAAgentRegistry.Recommendation.HOLD, bytes32(0)
        );
    }

    function test_RevertWhen_ScoreOutOfRange() public {
        vm.startPrank(agent);
        reg.registerAgent("ipfs://a");
        vm.expectRevert(RWAAgentRegistry.InvalidScore.selector);
        reg.logAnalysis(
            keccak256("bad"), "NVDAx", 101, 0, 0, int8(0), 0, RWAAgentRegistry.Recommendation.HOLD, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_VoteOncePerAddress() public {
        vm.prank(agent);
        reg.registerAgent("ipfs://a");
        bytes32 id = keccak256("a2");
        vm.prank(agent);
        reg.logAnalysis(
            id, "NVDAx", 50, 50, 50, int8(0), 50, RWAAgentRegistry.Recommendation.HOLD, bytes32(0)
        );

        vm.prank(voter);
        reg.voteAnalysis(id, true);
        (uint256 up, uint256 down) = reg.reputation(id);
        assertEq(up, 1);
        assertEq(down, 0);

        vm.prank(voter);
        vm.expectRevert(RWAAgentRegistry.AlreadyVoted.selector);
        reg.voteAnalysis(id, true);
    }
}
