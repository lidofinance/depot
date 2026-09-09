// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "../OmnibusBase.sol";
import {VoteCall} from "../libraries/calls-builder.sol";

contract MockOmnibus is OmnibusBase {
    constructor() OmnibusBase(address(0)) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory calls) {
        calls = new VoteCall[](1);
        calls[0] = VoteCall("Production deployment smoke", address(1), "");
    }
}
