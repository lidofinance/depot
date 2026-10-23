// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {AgentCalls} from "./Agent.sol";
import {
    ProposalCall,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils,
    ForwardedCallsBuilder,
    ForwardedCallsBuilderUtils
} from "./calls-builder.sol";

contract AgentCallsTest is Test {
    using AgentCalls for ProposalCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    address private constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    address private constant FIRST_TARGET = 0x0000000000000000000000000000000000000701;
    address private constant SECOND_TARGET = 0x0000000000000000000000000000000000000702;

    function test_SingleForwardKeepsOneProposalItemAndPacksItsCall() external pure {
        ProposalCall[] memory calls =
            ProposalCallsBuilderUtils.create(1).forward("Update app", AGENT, FIRST_TARGET, hex"12345678").getCalls();
        bytes memory script = abi.encodePacked(bytes4(0x00000001), FIRST_TARGET, uint32(4), hex"12345678");

        assertEq(calls.length, 1);
        assertEq(calls[0].title, "  Update app");
        assertEq(calls[0].target, AGENT);
        assertEq(calls[0].value, 0);
        assertEq(calls[0].payload, abi.encodeWithSignature("forward(bytes)", script));
    }

    function test_GroupedForwardKeepsNestedCallsInOrder() external pure {
        ProposalCall[] memory calls = ProposalCallsBuilderUtils.create(1)
            .forward(
                "Update both apps",
                AGENT,
                ForwardedCallsBuilderUtils.create(2)
                    .directCall("First app", FIRST_TARGET, hex"12345678")
                    .directCall("Second app", SECOND_TARGET, hex"aabbccdd1234")
            )
            .getCalls();
        bytes memory script = abi.encodePacked(
            bytes4(0x00000001), FIRST_TARGET, uint32(4), hex"12345678", SECOND_TARGET, uint32(6), hex"aabbccdd1234"
        );

        assertEq(calls.length, 1);
        assertEq(calls[0].title, "  Update both apps\n    First app\n    Second app");
        assertEq(calls[0].target, AGENT);
        assertEq(calls[0].value, 0);
        assertEq(calls[0].payload, abi.encodeWithSignature("forward(bytes)", script));
    }

    function test_ConsecutiveItemsRemainSeparateForwards() external pure {
        ProposalCall[] memory calls = ProposalCallsBuilderUtils.create(2)
            .forward("First", AGENT, FIRST_TARGET, hex"12345678")
            .forward("Second", AGENT, SECOND_TARGET, hex"aabbccdd")
            .getCalls();

        assertEq(calls.length, 2);
        assertEq(calls[0].title, "  First");
        assertEq(calls[1].title, "  Second");
        assertEq(
            calls[1].payload,
            abi.encodeWithSignature(
                "forward(bytes)", abi.encodePacked(bytes4(0x00000001), SECOND_TARGET, uint32(4), hex"aabbccdd")
            )
        );
    }
}
