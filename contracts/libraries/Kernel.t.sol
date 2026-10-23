// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {KernelCalls} from "./Kernel.sol";
import {ForwardedCall, ForwardedCallsBuilder, ForwardedCallsBuilderUtils} from "./calls-builder.sol";

contract KernelCallsTest is Test {
    using KernelCalls for ForwardedCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    address private constant KERNEL = 0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc;
    address private constant IMPLEMENTATION = 0x0000000000000000000000000000000000000702;

    function test_UpdatesOnlyTheSelectedAppBase() external pure {
        bytes32 appId = keccak256("depot.kernel-helper-test");
        ForwardedCall[] memory calls = ForwardedCallsBuilderUtils.create(1)
            .updateAppImplementation("Upgrade test app", KERNEL, appId, IMPLEMENTATION)
            .getCalls();

        assertEq(calls.length, 1);
        assertEq(calls[0].title, "    Upgrade test app");
        assertEq(calls[0].target, KERNEL);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature(
                "setApp(bytes32,bytes32,address)",
                bytes32(0xf1f3eb40f5bc1ad1344716ced8b8a0431d840b5783aea1fd01786bc26f35ac0f),
                appId,
                IMPLEMENTATION
            )
        );
    }
}
