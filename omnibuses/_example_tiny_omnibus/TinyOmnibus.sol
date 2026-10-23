// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {FinanceCalls} from "contracts/libraries/Finance.sol";
import {VoteCall, VoteCallsBuilder, VoteCallsBuilderUtils} from "contracts/libraries/calls-builder.sol";

contract TinyOmnibus is OmnibusBase {
    using FinanceCalls for VoteCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address public constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address public constant LDO = 0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32;
    address public constant RECIPIENT = 0x0000000000000000000000000000000000000777;
    uint256 public constant VOTE_ITEMS_COUNT = 1;
    uint256 public constant PAYMENT_AMOUNT = 10_000 ether;
    string public constant ITEM_TITLE = "Transfer 10,000 LDO to test address";

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create(VOTE_ITEMS_COUNT)
            .newImmediatePayment(ITEM_TITLE, FINANCE, LDO, RECIPIENT, PAYMENT_AMOUNT, ITEM_TITLE)
            .getCalls();
    }
}
