// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IKernel} from "../interfaces/IKernel.sol";
import {ForwardedCallsBuilder, ForwardedCallsBuilderUtils} from "./calls-builder.sol";

library KernelCalls {
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    function updateAppImplementation(
        ForwardedCallsBuilder memory self,
        string memory title,
        address kernel,
        bytes32 appId,
        address implementation
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title, kernel, abi.encodeCall(IKernel.setApp, (keccak256("base"), appId, implementation))
        );
    }
}
