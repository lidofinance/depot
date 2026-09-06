// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IEasyTrack} from "../interfaces/IEasyTrack.sol";
import {IFinance} from "../interfaces/IFinance.sol";
import {IAllowedRecipientsRegistry} from "../interfaces/IAllowedRecipientsRegistry.sol";
import {EasyTrackPermissionsUtils} from "./EasyTrackPermissions.sol";
import {VoteCallsBuilder, VoteCallsBuilderUtils} from "./calls-builder.sol";

library EasyTrackCalls {
    using EasyTrackPermissionsUtils for bytes;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    function addFactory(
        VoteCallsBuilder memory self,
        string memory title,
        address easyTrack,
        address factory,
        bytes memory permissions
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, easyTrack, abi.encodeCall(IEasyTrack.addEVMScriptFactory, (factory, permissions)));
    }

    function removeFactory(
        VoteCallsBuilder memory self,
        string memory title,
        address easyTrack,
        address factory
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, easyTrack, abi.encodeCall(IEasyTrack.removeEVMScriptFactory, (factory)));
    }

    function addTopUpFactory(
        VoteCallsBuilder memory self,
        string memory title,
        address easyTrack,
        address factory,
        address finance,
        address registry
    ) internal pure returns (VoteCallsBuilder memory) {
        bytes memory permissions = EasyTrackPermissionsUtils.permission(finance, IFinance.newImmediatePayment.selector)
            .and(registry, IAllowedRecipientsRegistry.updateSpentAmount.selector);
        return addFactory(self, title, easyTrack, factory, permissions);
    }

    function addRecipientFactory(
        VoteCallsBuilder memory self,
        string memory title,
        address easyTrack,
        address factory,
        address registry
    ) internal pure returns (VoteCallsBuilder memory) {
        bytes memory permissions = EasyTrackPermissionsUtils.permission(
            registry, IAllowedRecipientsRegistry.addRecipient.selector
        );
        return addFactory(self, title, easyTrack, factory, permissions);
    }

    /// @notice Registers a factory that removes allowed recipients.
    function removeRecipientFactory(
        VoteCallsBuilder memory self,
        string memory title,
        address easyTrack,
        address factory,
        address registry
    ) internal pure returns (VoteCallsBuilder memory) {
        bytes memory permissions = EasyTrackPermissionsUtils.permission(
            registry, IAllowedRecipientsRegistry.removeRecipient.selector
        );
        return addFactory(self, title, easyTrack, factory, permissions);
    }
}
