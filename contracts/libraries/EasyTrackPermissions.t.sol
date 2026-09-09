// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {EasyTrackPermissionsUtils} from "./EasyTrackPermissions.sol";
import {IFinance} from "../interfaces/IFinance.sol";
import {IStakingRouter} from "../interfaces/IStakingRouter.sol";
import {IAllowedRecipientsRegistry} from "../interfaces/IAllowedRecipientsRegistry.sol";
import {IUpdateStakingModuleShareLimits} from "../interfaces/IUpdateStakingModuleShareLimits.sol";
import {MainnetAddresses as Addresses} from "../addresses/MainnetAddresses.sol";

/// @dev Expected blobs are the permissions registered by mainnet vote #204 (executed on
///      2026-08-10). They pin the encoding to what Easy Track accepts in production.
contract EasyTrackPermissionsTest is Test {
    using EasyTrackPermissionsUtils for bytes;

    address private constant LOL_STABLES_REGISTRY = 0x8d8b35cA51e7808098afF4918C21Ce428c943F89;
    address private constant UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY = 0xde3e46E3129fA4e4e3f66c9024B0A3Ad509b27a1;

    function test_SinglePermissionIsAddressFollowedBySelector() external pure {
        bytes memory permissions = EasyTrackPermissionsUtils.permission(
            LOL_STABLES_REGISTRY, IAllowedRecipientsRegistry.addRecipient.selector
        );

        assertEq(permissions.length, 24);
        assertEq(permissions, hex"8d8b35ca51e7808098aff4918c21ce428c943f89739b5384");
    }

    function test_PermissionsAreConcatenatedInOrder() external pure {
        bytes memory permissions = EasyTrackPermissionsUtils.permission(
                Addresses.FINANCE, IFinance.newImmediatePayment.selector
            )
            .and(LOL_STABLES_REGISTRY, IAllowedRecipientsRegistry.updateSpentAmount.selector);

        assertEq(permissions.length, 48);
        assertEq(
            permissions,
            hex"b9e5cbb9ca5b0d659238807e84d0176930753d86f63648468d8b35ca51e7808098aff4918c21ce428c943f8966671229"
        );
    }

    function test_PermissionsAcrossTwoDifferentContracts() external pure {
        bytes memory permissions = EasyTrackPermissionsUtils.permission(
                UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY, IUpdateStakingModuleShareLimits.validateParams.selector
            )
            .and(Addresses.STAKING_ROUTER, IStakingRouter.updateModuleShares.selector);

        assertEq(
            permissions,
            hex"de3e46e3129fa4e4e3f66c9024b0a3ad509b27a15adcee90fddf38947afb03c621c71b06c9c70bce73f1299913976a06"
        );
    }
}
