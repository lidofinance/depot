// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {FinanceCalls} from "contracts/libraries/Finance.sol";
import {VoteCall, VoteCallsBuilder, VoteCallsBuilderUtils} from "contracts/libraries/calls-builder.sol";

/// @notice Reproduces the 2500 stETH Finance payment of mainnet vote #200 to the LLF operational multisig.
contract FinanceOmnibus is OmnibusBase {
    using FinanceCalls for VoteCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address public constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address public constant STETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
    address public constant RECIPIENT = 0x95B521B4F55a447DB89f6a27f951713fC2035f3F;
    uint256 public constant VOTE_ITEMS_COUNT = 1;
    uint256 public constant PAYMENT_AMOUNT = 2500 ether;
    string public constant PAYMENT_REFERENCE =
        "Transfer 2500 stETH from Aragon Agent to Lido Labs Foundation operational multisig";
    string public constant ITEM_TITLE =
        "Transfer 2500 stETH 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84 from Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c to Lido Labs Foundation operational multisig 0x95B521B4F55a447DB89f6a27f951713fC2035f3F";

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create(VOTE_ITEMS_COUNT)
            .newImmediatePayment(ITEM_TITLE, FINANCE, STETH, RECIPIENT, PAYMENT_AMOUNT, PAYMENT_REFERENCE)
            .getCalls();
    }
}
