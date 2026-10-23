// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {NodeOperatorsCalls} from "./NodeOperators.sol";
import {ForwardedCall, ForwardedCallsBuilder, ForwardedCallsBuilderUtils} from "./calls-builder.sol";

contract NodeOperatorsCallsTest is Test {
    using NodeOperatorsCalls for ForwardedCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    address private constant REGISTRY = 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5;
    address private constant STAKING_ROUTER = 0xFdDf38947aFB03C621C71b06C9C70bce73f12999;
    address private constant REWARD = 0xF45C77EadD434612fCD93db978B3E36B0D58eC99;

    function test_NameAndRewardUpdatesKeepTheOperatorIdAndValues() external pure {
        ForwardedCall[] memory calls = ForwardedCallsBuilderUtils.create(2)
            .setName("Rename operator", REGISTRY, 21, "Consensys test")
            .setRewardAddress("Change rewards", REGISTRY, 21, REWARD)
            .getCalls();

        assertEq(calls[0].title, "    Rename operator");
        assertEq(calls[0].target, REGISTRY);
        assertEq(calls[0].payload, abi.encodeWithSignature("setNodeOperatorName(uint256,string)", 21, "Consensys test"));
        assertEq(calls[1].title, "    Change rewards");
        assertEq(calls[1].target, REGISTRY);
        assertEq(calls[1].payload, abi.encodeWithSignature("setNodeOperatorRewardAddress(uint256,address)", 21, REWARD));
    }

    function test_DeactivationTargetsTheRegistry() external pure {
        ForwardedCall[] memory calls =
            ForwardedCallsBuilderUtils.create(1).deactivate("Deactivate operator", REGISTRY, 21).getCalls();

        assertEq(calls[0].title, "    Deactivate operator");
        assertEq(calls[0].target, REGISTRY);
        assertEq(calls[0].payload, abi.encodeWithSignature("deactivateNodeOperator(uint256)", 21));
    }

    function test_TargetLimitsGoThroughTheRouterWithTheirModuleId() external pure {
        ForwardedCall[] memory calls = ForwardedCallsBuilderUtils.create(1)
            .updateTargetValidatorsLimits("Set target", STAKING_ROUTER, 1, 21, 2, 100)
            .getCalls();

        assertEq(calls[0].title, "    Set target");
        assertEq(calls[0].target, STAKING_ROUTER);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature("updateTargetValidatorsLimits(uint256,uint256,uint256,uint256)", 1, 21, 2, 100)
        );
    }
}
