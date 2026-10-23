// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils
} from "./calls-builder.sol";
import {ExternalCall} from "../interfaces/IGovernance.sol";
import {IOracleRouter} from "../interfaces/IOracleRouter.sol";
import {MainnetAddresses as Addresses} from "../addresses/MainnetAddresses.sol";

/// @dev The description of a Dual Governance proposal is an argument of `submitProposal`, so it is
///      part of the payload the DAO votes on. These tests pin down where it comes from.
contract CallsBuilderTest is Test {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;

    address private constant ORACLE_ROUTER = 0x79ef3a538200Fe4981D67E7e886bfb36D4Cb5a31;
    address private constant TMC = 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647;

    string private constant VOTE_ITEM_TITLE = "1. Submit a Dual Governance proposal to activate NEST";
    string private constant PROPOSAL_METADATA = "Activate NEST";

    function test_ProposalMetadataIsTakenAsGiven() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .submitCalls(VOTE_ITEM_TITLE, PROPOSAL_METADATA, Addresses.DUAL_GOVERNANCE, _proposalCalls())
            .getCalls();

        (, string memory metadata) = _decodeSubmitProposal(calls[0].payload);

        assertEq(metadata, PROPOSAL_METADATA);
    }

    function test_VoteItemTitleDoesNotReachThePayload() external pure {
        VoteCall[] memory withOneTitle = VoteCallsBuilderUtils.create(1)
            .submitCalls(VOTE_ITEM_TITLE, PROPOSAL_METADATA, Addresses.DUAL_GOVERNANCE, _proposalCalls())
            .getCalls();
        VoteCall[] memory withAnotherTitle = VoteCallsBuilderUtils.create(1)
            .submitCalls(
                "1. Something worded differently", PROPOSAL_METADATA, Addresses.DUAL_GOVERNANCE, _proposalCalls()
            )
            .getCalls();

        assertEq(withOneTitle[0].payload, withAnotherTitle[0].payload);
    }

    function test_ProposalCallsSurviveEncoding() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .submitCalls(VOTE_ITEM_TITLE, PROPOSAL_METADATA, Addresses.DUAL_GOVERNANCE, _proposalCalls())
            .getCalls();

        (ExternalCall[] memory externalCalls,) = _decodeSubmitProposal(calls[0].payload);

        assertEq(calls[0].target, Addresses.DUAL_GOVERNANCE);
        assertEq(externalCalls.length, 1);
        assertEq(externalCalls[0].target, ORACLE_ROUTER);
        assertEq(externalCalls[0].payload, abi.encodeCall(IOracleRouter.setManager, (TMC)));
    }

    function test_OmittedMetadataIsComposedFromTitles() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .submitCalls(VOTE_ITEM_TITLE, Addresses.DUAL_GOVERNANCE, _proposalCalls())
            .getCalls();

        (, string memory metadata) = _decodeSubmitProposal(calls[0].payload);

        assertEq(metadata, string.concat(VOTE_ITEM_TITLE, "\n  ", "Set Treasury Management Committee as manager"));
    }

    // ---
    // Helpers
    // ---

    function _proposalCalls() private pure returns (ProposalCallsBuilder memory) {
        return ProposalCallsBuilderUtils.create(1)
            .directCall(
                "Set Treasury Management Committee as manager",
                ORACLE_ROUTER,
                abi.encodeCall(IOracleRouter.setManager, (TMC))
            );
    }

    function _decodeSubmitProposal(bytes memory payload)
        private
        pure
        returns (ExternalCall[] memory externalCalls, string memory metadata)
    {
        bytes memory args = new bytes(payload.length - 4);
        for (uint256 i = 0; i < args.length; ++i) {
            args[i] = payload[i + 4];
        }
        (externalCalls, metadata) = abi.decode(args, (ExternalCall[], string));
    }
}
