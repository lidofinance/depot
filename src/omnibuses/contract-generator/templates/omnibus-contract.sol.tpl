// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "contracts/OmnibusBase.sol";
import "contracts/libraries/calls-builder.sol";

{{INTERFACE_DECLARATIONS}}

contract {{CONTRACT_NAME}} is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    // ---
    // Constants
    // ---

{{CONSTANTS_SECTION}}

    // ---
    // Contract Addresses
    // ---

{{ADDRESS_SECTION}}

    // ---
    // Constructor
    // ---

{{CONSTRUCTOR_SECTION}}

    function getOmnibusCalls() public view override returns (VoteCall[] memory) {
        return {{VOTE_CALLS_CHAIN}};
    }
}
