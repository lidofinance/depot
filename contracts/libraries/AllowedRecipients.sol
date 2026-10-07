// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IAllowedRecipientsRegistry} from "../interfaces/IAllowedRecipientsRegistry.sol";
import {ForwardedCallsBuilder, ForwardedCallsBuilderUtils} from "./calls-builder.sol";

library AllowedRecipientsCalls {
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    function setLimitParameters(
        ForwardedCallsBuilder memory self,
        string memory title,
        address registry,
        uint256 limit,
        uint256 periodDurationMonths
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title,
            registry,
            abi.encodeCall(IAllowedRecipientsRegistry.setLimitParameters, (limit, periodDurationMonths))
        );
    }

    function unsafeSetSpentAmount(
        ForwardedCallsBuilder memory self,
        string memory title,
        address registry,
        uint256 spentAmount
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title, registry, abi.encodeCall(IAllowedRecipientsRegistry.unsafeSetSpentAmount, (spentAmount))
        );
    }

    function addRecipient(
        ForwardedCallsBuilder memory self,
        string memory title,
        address registry,
        address recipient,
        string memory recipientTitle
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title, registry, abi.encodeCall(IAllowedRecipientsRegistry.addRecipient, (recipient, recipientTitle))
        );
    }
}
