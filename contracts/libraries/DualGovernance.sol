// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {VoteCallsBuilder, VoteCallsBuilderUtils, ProposalCallsBuilder} from "./calls-builder.sol";

library DualGovernanceCalls {
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    function submitProposal(
        VoteCallsBuilder memory self,
        string memory title,
        string memory metadata,
        address governance,
        ProposalCallsBuilder memory calls
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.submitCalls(title, metadata, governance, calls);
    }
}
