// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {AllowedRecipientsCalls} from "./AllowedRecipients.sol";
import {ForwardedCall, ForwardedCallsBuilder, ForwardedCallsBuilderUtils} from "./calls-builder.sol";

contract AllowedRecipientsCallsTest is Test {
    using AllowedRecipientsCalls for ForwardedCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    address private constant REGISTRY = 0x8d8b35cA51e7808098afF4918C21Ce428c943F89;
    address private constant RECIPIENT = 0xAA568141c051f2D1132b110f8391F18D48E8D889;

    function test_SetLimitParametersBuildsForwardedRegistryCall() external pure {
        ForwardedCall[] memory calls = ForwardedCallsBuilderUtils.create(1)
            .setLimitParameters("Update quarterly limit", REGISTRY, 1000 ether, 3)
            .getCalls();

        assertEq(calls[0].title, "    Update quarterly limit");
        assertEq(calls[0].target, REGISTRY);
        assertEq(calls[0].payload, abi.encodeWithSignature("setLimitParameters(uint256,uint256)", 1000 ether, 3));
    }

    function test_ResetSpentAmountFollowsTheLimitUpdate() external pure {
        ForwardedCall[] memory calls = ForwardedCallsBuilderUtils.create(2)
            .setLimitParameters("Update quarterly limit", REGISTRY, 1000 ether, 3)
            .unsafeSetSpentAmount("Reset spent amount", REGISTRY, 0)
            .getCalls();

        assertEq(calls.length, 2);
        assertEq(calls[0].payload, abi.encodeWithSignature("setLimitParameters(uint256,uint256)", 1000 ether, 3));
        assertEq(calls[1].title, "    Reset spent amount");
        assertEq(calls[1].target, REGISTRY);
        assertEq(calls[1].payload, abi.encodeWithSignature("unsafeSetSpentAmount(uint256)", 0));
    }

    function test_AddRecipientKeepsItsNameSeparateFromTheVoteItemTitle() external pure {
        ForwardedCall[] memory calls = ForwardedCallsBuilderUtils.create(1)
            .addRecipient("Add NEST recipient", REGISTRY, RECIPIENT, "Buyback Allocator")
            .getCalls();

        assertEq(calls[0].title, "    Add NEST recipient");
        assertEq(calls[0].target, REGISTRY);
        assertEq(
            calls[0].payload, abi.encodeWithSignature("addRecipient(address,string)", RECIPIENT, "Buyback Allocator")
        );
    }
}
