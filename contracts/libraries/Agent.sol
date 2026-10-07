// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ProposalCallsBuilder, ProposalCallsBuilderUtils, ForwardedCallsBuilder} from "./calls-builder.sol";

library AgentCalls {
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;

    function forward(
        ProposalCallsBuilder memory self,
        string memory title,
        address agent,
        address target,
        bytes memory payload
    ) internal pure returns (ProposalCallsBuilder memory) {
        return self.forwardCall(title, agent, target, payload);
    }

    function forward(
        ProposalCallsBuilder memory self,
        string memory title,
        address agent,
        ForwardedCallsBuilder memory calls
    ) internal pure returns (ProposalCallsBuilder memory) {
        return self.forwardCalls(title, agent, calls);
    }
}
