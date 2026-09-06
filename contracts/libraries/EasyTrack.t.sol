// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {EasyTrackCalls} from "./EasyTrack.sol";
import {VoteCall, VoteCallsBuilder, VoteCallsBuilderUtils} from "./calls-builder.sol";

contract EasyTrackCallsTest is Test {
    using EasyTrackCalls for VoteCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address private constant EASY_TRACK = 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea;
    address private constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address private constant REGISTRY = 0x8d8b35cA51e7808098afF4918C21Ce428c943F89;
    address private constant FACTORY = 0xc72d4C3e86b681D7c9EE306D41193C64D709C303;

    function test_AddFactoryPreservesVoteItemAndPermissionBytes() external pure {
        bytes memory permissions = hex"8d8b35ca51e7808098aff4918c21ce428c943f89739b5384";
        VoteCall[] memory calls =
            VoteCallsBuilderUtils.create(1).addFactory("Register factory", EASY_TRACK, FACTORY, permissions).getCalls();

        assertEq(calls.length, 1);
        assertEq(calls[0].title, "Register factory");
        assertEq(calls[0].target, EASY_TRACK);
        assertEq(calls[0].payload, abi.encodeWithSignature("addEVMScriptFactory(address,bytes)", FACTORY, permissions));
    }

    function test_FactoryReplacementKeepsRemovalBeforeRegistration() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(2).removeFactory("Remove factory", EASY_TRACK, FACTORY)
            .addFactory("Register factory", EASY_TRACK, FACTORY, hex"8d8b35ca51e7808098aff4918c21ce428c943f89739b5384")
            .getCalls();

        assertEq(calls.length, 2);
        assertEq(calls[0].title, "Remove factory");
        assertEq(calls[0].target, EASY_TRACK);
        assertEq(calls[0].payload, abi.encodeWithSignature("removeEVMScriptFactory(address)", FACTORY));
        assertEq(calls[1].title, "Register factory");
    }

    function test_TopUpFactoryUsesVote204FinanceThenRegistryPermissions() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .addTopUpFactory("Register top-up factory", EASY_TRACK, FACTORY, FINANCE, REGISTRY).getCalls();

        assertEq(calls[0].target, EASY_TRACK);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature(
                "addEVMScriptFactory(address,bytes)",
                FACTORY,
                hex"b9e5cbb9ca5b0d659238807e84d0176930753d86f63648468d8b35ca51e7808098aff4918c21ce428c943f8966671229"
            )
        );
    }

    function test_AddRecipientFactoryOnlyPermitsAddingToItsRegistry() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .addRecipientFactory("Register add-recipient factory", EASY_TRACK, FACTORY, REGISTRY).getCalls();

        assertEq(calls[0].target, EASY_TRACK);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature(
                "addEVMScriptFactory(address,bytes)", FACTORY, hex"8d8b35ca51e7808098aff4918c21ce428c943f89739b5384"
            )
        );
    }

    function test_RemoveRecipientFactoryOnlyPermitsRemovingFromItsRegistry() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .removeRecipientFactory("Register remove-recipient factory", EASY_TRACK, FACTORY, REGISTRY).getCalls();

        assertEq(calls[0].target, EASY_TRACK);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature(
                "addEVMScriptFactory(address,bytes)", FACTORY, hex"8d8b35ca51e7808098aff4918c21ce428c943f8912a29198"
            )
        );
    }
}
