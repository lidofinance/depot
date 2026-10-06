// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ExampleContractOmnibus} from "./ExampleContractOmnibus.sol";
import {ExampleContractOmnibusVoteStateValidator} from "./ExampleContractOmnibusVoteStateValidator.sol";
import {Test} from "forge-std/Test.sol";

contract ExampleContractOmnibusTest is Test {
    address private constant LDO = 0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32;
    address private constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    uint256 private constant EXPECTED_SPENT = 290_000 * 10 ** 18;

    function test_DeploysAndBuildsCalls() external {
        ExampleContractOmnibusVoteStateValidator voteStateValidator =
            new ExampleContractOmnibusVoteStateValidator(LDO, AGENT, EXPECTED_SPENT);
        ExampleContractOmnibus omnibus = new ExampleContractOmnibus(address(voteStateValidator));

        assertEq(omnibus.ACTION_VALIDATOR(), address(voteStateValidator));
        assertEq(omnibus.getOmnibusCalls().length, omnibus.VOTE_ITEMS_COUNT());
    }
}
