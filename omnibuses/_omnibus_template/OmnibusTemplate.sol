// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {VoteCall, VoteCallsBuilder, VoteCallsBuilderUtils} from "contracts/libraries/calls-builder.sol";

contract OmnibusTemplate is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    uint256 public constant VOTE_ITEMS_COUNT = 1;

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        // Fill the builder and item count from the Markdown description.
        return VoteCallsBuilderUtils.create(VOTE_ITEMS_COUNT).getCalls();
    }
}
