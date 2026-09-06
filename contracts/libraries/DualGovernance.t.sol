// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ExternalCall} from "../interfaces/IGovernance.sol";
import {DualGovernanceCalls} from "./DualGovernance.sol";
import {
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils
} from "./calls-builder.sol";

contract DualGovernanceCallsTest is Test {
    using DualGovernanceCalls for VoteCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;

    address private constant GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address private constant FIRST_TARGET = 0x0000000000000000000000000000000000000701;
    address private constant SECOND_TARGET = 0x0000000000000000000000000000000000000702;

    function test_SubmitKeepsExplicitMetadataAndExternalCallsByteForByte() external pure {
        string memory metadata = "Upgrade apps\n\nKeep this description exactly.\n";
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .submitProposal(
                "Human title",
                metadata,
                GOVERNANCE,
                ProposalCallsBuilderUtils.create(2).directCall("First", FIRST_TARGET, hex"12345678")
                    .directCallWithValue("Second", SECOND_TARGET, 7, hex"aabbccdd")
            ).getCalls();
        ExternalCall[] memory externalCalls = new ExternalCall[](2);
        externalCalls[0] = ExternalCall(FIRST_TARGET, 0, hex"12345678");
        externalCalls[1] = ExternalCall(SECOND_TARGET, 7, hex"aabbccdd");

        assertEq(calls.length, 1);
        assertEq(calls[0].title, "Human title");
        assertEq(calls[0].target, GOVERNANCE);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature("submitProposal((address,uint96,bytes)[],string)", externalCalls, metadata)
        );
    }
}
