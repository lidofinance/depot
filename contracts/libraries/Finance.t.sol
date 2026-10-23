// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {FinanceCalls} from "./Finance.sol";
import {VoteCall, VoteCallsBuilder, VoteCallsBuilderUtils} from "./calls-builder.sol";

contract FinanceCallsTest is Test {
    using FinanceCalls for VoteCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address private constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address private constant STETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
    address private constant RECIPIENT = 0x95B521B4F55a447DB89f6a27f951713fC2035f3F;
    string private constant REFERENCE =
        "Transfer 2500 stETH from Aragon Agent to Lido Labs Foundation operational multisig";

    function test_Vote200PayoutTargetsFinanceAndKeepsItsReference() external pure {
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .newImmediatePayment("Fund LLF", FINANCE, STETH, RECIPIENT, 2500 ether, REFERENCE)
            .getCalls();

        assertEq(calls[0].title, "Fund LLF");
        assertEq(calls[0].target, FINANCE);
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature(
                "newImmediatePayment(address,address,uint256,string)", STETH, RECIPIENT, 2500 ether, REFERENCE
            )
        );
    }
}
