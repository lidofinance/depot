// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IFinance} from "../interfaces/IFinance.sol";
import {VoteCallsBuilder, VoteCallsBuilderUtils} from "./calls-builder.sol";

library FinanceCalls {
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    function newImmediatePayment(
        VoteCallsBuilder memory self,
        string memory title,
        address finance,
        address token,
        address recipient,
        uint256 amount,
        string memory paymentReference
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(
            title, finance, abi.encodeCall(IFinance.newImmediatePayment, (token, recipient, amount, paymentReference))
        );
    }
}
