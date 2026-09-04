// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {MainnetAddresses as Addresses} from "contracts/addresses/MainnetAddresses.sol";
import {
    ForwardedCallsBuilder,
    ForwardedCallsBuilderUtils,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils,
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils
} from "contracts/libraries/calls-builder.sol";
import {EasyTrackPermissionsUtils} from "contracts/libraries/EasyTrackPermissions.sol";

import {IAccessControl} from "contracts/interfaces/IAccessControl.sol";
import {IAllowedRecipientsRegistry} from "contracts/interfaces/IAllowedRecipientsRegistry.sol";
import {IBuybackAllocator, IBuybackExecutor} from "contracts/interfaces/IBuybacks.sol";
import {IEasyTrack} from "contracts/interfaces/IEasyTrack.sol";
import {IFinance} from "contracts/interfaces/IFinance.sol";
import {IOracleRouter} from "contracts/interfaces/IOracleRouter.sol";
import {IOssifiableProxy} from "contracts/interfaces/IOssifiableProxy.sol";
import {IStakingRouter} from "contracts/interfaces/IStakingRouter.sol";
import {ITokenRateNotifier} from "contracts/interfaces/ITokenRateNotifier.sol";
import {IUpdateStakingModuleShareLimits} from "contracts/interfaces/IUpdateStakingModuleShareLimits.sol";

/// @title Omnibus_2026_08_05
/// @notice Vote #204: NEST activation, LOL ET stablecoins payment factories activation and the
///     replacement of the ET factory for CSM share limit updates.
///
///     1. Submit a Dual Governance proposal containing a single Aragon Agent forward call to Dual Governance
///        1.1. Add OpStackTokenRatePusher as NoArgs observer kind 0 to TokenRateNotifier
///        1.2. Add StakingRevenueSource as WithArgs observer kind 1 to TokenRateNotifier
///        1.3. Upgrade Lido Locator to the new implementation
///        1.4. Add BuybackAllocator as allowed recipient with name Buyback Allocator on Stonks stETH AllowedRecipientsRegistry
///        1.5. Grant ADD_RECIPIENT_TO_ALLOWED_LIST_ROLE to EVMScriptExecutor on LOL stablecoins AllowedRecipientsRegistry
///        1.6. Grant REMOVE_RECIPIENT_FROM_ALLOWED_LIST_ROLE to EVMScriptExecutor on LOL stablecoins AllowedRecipientsRegistry
///     2. Set Treasury Management Committee as manager on OracleRouter
///     3. Set treasury-mode Stonks on BuybackExecutor
///     4. Grant Buybacks.BuybackExecutor.ALLOCATOR_ROLE to BuybackAllocator on BuybackExecutor
///     5. Grant Buybacks.MANAGER_ROLE to Treasury Management Committee on BuybackExecutor
///     6. Grant Buybacks.BuybackExecutor.EMERGENCY_ROLE to Treasury Management Committee on BuybackExecutor
///     7. Grant Buybacks.BuybackExecutor.EMERGENCY_ROLE to Ethereum Emergency Brakes multisig on BuybackExecutor
///     8. Grant Buybacks.MANAGER_ROLE to Treasury Management Committee on BuybackAllocator
///     9. Call activate() on BuybackAllocator
///     10. Remove UpdateStakingModuleShareLimits EVM script factory from EasyTrack
///     11. Add UpdateStakingModuleShareLimits EVM script factory to EasyTrack
///     12. Add LOL stablecoins TopUpAllowedRecipients EVM script factory to EasyTrack
///     13. Add LOL stablecoins AddAllowedRecipient EVM script factory to EasyTrack
///     14. Add LOL stablecoins RemoveAllowedRecipient EVM script factory to EasyTrack
contract Omnibus_2026_08_05 is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;
    using EasyTrackPermissionsUtils for bytes;

    // ---
    // NEST
    // ---

    address public constant OP_STACK_TOKEN_RATE_PUSHER = 0xd54c1c6413caac3477AC14b2a80D5398E3c32FfE;
    address public constant STAKING_REVENUE_SOURCE = 0x6220212a33a87Ed7Cc386B67eB2c393974F28C38;
    address public constant LIDO_LOCATOR_IMPLEMENTATION = 0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313;
    address public constant STONKS_STETH_ALLOWED_RECIPIENTS_REGISTRY = 0x1a7cFA9EFB4D5BfFDE87B0FaEb1fC65d653868C0;
    address public constant ORACLE_ROUTER = 0x79ef3a538200Fe4981D67E7e886bfb36D4Cb5a31;
    address public constant BUYBACK_EXECUTOR = 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7;
    address public constant BUYBACK_ALLOCATOR = 0xAA568141c051f2D1132b110f8391F18D48E8D889;
    address public constant TREASURY_MODE_STONKS = 0xb368586CB980895E51e1D82102E63b3F69d3F151;
    address public constant TREASURY_MANAGEMENT_COMMITTEE = 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647;

    uint8 public constant OBSERVER_KIND_NO_ARGS = 0;
    uint8 public constant OBSERVER_KIND_WITH_ARGS = 1;
    string public constant BUYBACK_ALLOCATOR_RECIPIENT_TITLE = "Buyback Allocator";

    bytes32 public constant BUYBACK_EXECUTOR_ALLOCATOR_ROLE =
        0x87905334ad07701d0cd9b21ea0599de1a0cab067e0ab49596d423d87159ac7f2;
    bytes32 public constant BUYBACKS_MANAGER_ROLE = 0x24bec1f1283f989ed510b4d89bc7ef5002f20db1b60c1b3192336791c868543e;
    bytes32 public constant BUYBACK_EXECUTOR_EMERGENCY_ROLE =
        0xc748c205190870b4e890036f373e30556929f7fbf3db8644c998a652c1996dbd;

    // ---
    // LOL ET stablecoins payment factories
    // ---

    address public constant LOL_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY = 0x8d8b35cA51e7808098afF4918C21Ce428c943F89;
    address public constant LOL_STABLECOINS_TOP_UP_FACTORY = 0xc72d4C3e86b681D7c9EE306D41193C64D709C303;
    address public constant LOL_STABLECOINS_ADD_RECIPIENT_FACTORY = 0xe24230619e9218C1eed3de3489a22f6BC3ce18FF;
    address public constant LOL_STABLECOINS_REMOVE_RECIPIENT_FACTORY = 0xF4d5D97C85eD18f77F99B57f55E9E11d52992632;

    bytes32 public constant ADD_RECIPIENT_TO_ALLOWED_LIST_ROLE =
        0xec20c52871c824e5437859e75ac830e83aaaaeb7b0ffd850de830ddd3e385276;
    bytes32 public constant REMOVE_RECIPIENT_FROM_ALLOWED_LIST_ROLE =
        0x491d7752c25cfca0f73715cde1130022a9b815373f91a996bbb1ba8943efc99b;

    // ---
    // ET factory for CSM share limit updates
    // ---

    address public constant OLD_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY = 0x0C6703F1d8D9DdfB6c6e5F57b4f7432a6500D6D8;
    address public constant NEW_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY = 0xde3e46E3129fA4e4e3f66c9024B0A3Ad509b27a1;

    // ---
    // Vote
    // ---

    string internal constant DG_PROPOSAL_METADATA =
        "Activate NEST and add LOL stablecoins Easy Track factories to add/remove allowed recipients";

    uint256 public constant VOTE_ITEMS_COUNT = 14;
    uint256 public constant DG_PROPOSAL_CALLS_COUNT = 1;
    uint256 public constant AGENT_FORWARDED_CALLS_COUNT = 6;

    constructor() OmnibusBase(Addresses.VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create({
            callsCount: VOTE_ITEMS_COUNT
        }).submitCalls(
                "Submit a Dual Governance proposal containing a single Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c forward call to Dual Governance 0xC1db28B3301331277e307FDCfF8DE28242A4486E",
                DG_PROPOSAL_METADATA,
                Addresses.DUAL_GOVERNANCE,
                ProposalCallsBuilderUtils.create({
                    callsCount: DG_PROPOSAL_CALLS_COUNT
                }).forwardCalls(
                        "Single Aragon Agent forward call with the following calls",
                        Addresses.AGENT,
                        ForwardedCallsBuilderUtils.create({
                            callsCount: AGENT_FORWARDED_CALLS_COUNT
                        }).directCall(
                                "Add OpStackTokenRatePusher 0xd54c1c6413caac3477AC14b2a80D5398E3c32FfE as NoArgs observer kind 0 to TokenRateNotifier 0xbe05d12Fd10919F1881125006523452F6aFF791b",
                                Addresses.TOKEN_RATE_NOTIFIER,
                                abi.encodeCall(
                                    ITokenRateNotifier.addObserver, (OP_STACK_TOKEN_RATE_PUSHER, OBSERVER_KIND_NO_ARGS)
                                )
                            )
                            .directCall(
                                "Add StakingRevenueSource 0x6220212a33a87Ed7Cc386B67eB2c393974F28C38 as WithArgs observer kind 1 to TokenRateNotifier 0xbe05d12Fd10919F1881125006523452F6aFF791b",
                                Addresses.TOKEN_RATE_NOTIFIER,
                                abi.encodeCall(
                                    ITokenRateNotifier.addObserver, (STAKING_REVENUE_SOURCE, OBSERVER_KIND_WITH_ARGS)
                                )
                            )
                            .directCall(
                                "Upgrade Lido Locator 0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb to implementation 0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313",
                                Addresses.LIDO_LOCATOR,
                                abi.encodeCall(IOssifiableProxy.proxy__upgradeTo, (LIDO_LOCATOR_IMPLEMENTATION))
                            )
                            .directCall(
                                "Add BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889 as allowed recipient with name Buyback Allocator on Stonks stETH AllowedRecipientsRegistry 0x1a7cFA9EFB4D5BfFDE87B0FaEb1fC65d653868C0",
                                STONKS_STETH_ALLOWED_RECIPIENTS_REGISTRY,
                                abi.encodeCall(
                                    IAllowedRecipientsRegistry.addRecipient,
                                    (BUYBACK_ALLOCATOR, BUYBACK_ALLOCATOR_RECIPIENT_TITLE)
                                )
                            )
                            .directCall(
                                "Grant ADD_RECIPIENT_TO_ALLOWED_LIST_ROLE 0xec20c52871c824e5437859e75ac830e83aaaaeb7b0ffd850de830ddd3e385276 to EVMScriptExecutor 0xFE5986E06210aC1eCC1aDCafc0cc7f8D63B3F977 on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89",
                                LOL_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY,
                                abi.encodeCall(
                                    IAccessControl.grantRole,
                                    (ADD_RECIPIENT_TO_ALLOWED_LIST_ROLE, Addresses.EASY_TRACK_EVM_SCRIPT_EXECUTOR)
                                )
                            )
                            .directCall(
                                "Grant REMOVE_RECIPIENT_FROM_ALLOWED_LIST_ROLE 0x491d7752c25cfca0f73715cde1130022a9b815373f91a996bbb1ba8943efc99b to EVMScriptExecutor 0xFE5986E06210aC1eCC1aDCafc0cc7f8D63B3F977 on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89",
                                LOL_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY,
                                abi.encodeCall(
                                    IAccessControl.grantRole,
                                    (REMOVE_RECIPIENT_FROM_ALLOWED_LIST_ROLE, Addresses.EASY_TRACK_EVM_SCRIPT_EXECUTOR)
                                )
                            )
                    )
            )
            .directCall(
                "Set Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 as manager on OracleRouter 0x79ef3a538200Fe4981D67E7e886bfb36D4Cb5a31",
                ORACLE_ROUTER,
                abi.encodeCall(IOracleRouter.setManager, (TREASURY_MANAGEMENT_COMMITTEE))
            )
            .directCall(
                "Set treasury-mode Stonks 0xb368586CB980895E51e1D82102E63b3F69d3F151 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
                BUYBACK_EXECUTOR,
                abi.encodeCall(IBuybackExecutor.setStonks, (TREASURY_MODE_STONKS))
            )
            .directCall(
                "Grant Buybacks.BuybackExecutor.ALLOCATOR_ROLE 0x87905334ad07701d0cd9b21ea0599de1a0cab067e0ab49596d423d87159ac7f2 to BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
                BUYBACK_EXECUTOR,
                abi.encodeCall(IAccessControl.grantRole, (BUYBACK_EXECUTOR_ALLOCATOR_ROLE, BUYBACK_ALLOCATOR))
            )
            .directCall(
                "Grant Buybacks.MANAGER_ROLE 0x24bec1f1283f989ed510b4d89bc7ef5002f20db1b60c1b3192336791c868543e to Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
                BUYBACK_EXECUTOR,
                abi.encodeCall(IAccessControl.grantRole, (BUYBACKS_MANAGER_ROLE, TREASURY_MANAGEMENT_COMMITTEE))
            )
            .directCall(
                "Grant Buybacks.BuybackExecutor.EMERGENCY_ROLE 0xc748c205190870b4e890036f373e30556929f7fbf3db8644c998a652c1996dbd to Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
                BUYBACK_EXECUTOR,
                abi.encodeCall(
                    IAccessControl.grantRole, (BUYBACK_EXECUTOR_EMERGENCY_ROLE, TREASURY_MANAGEMENT_COMMITTEE)
                )
            )
            .directCall(
                "Grant Buybacks.BuybackExecutor.EMERGENCY_ROLE 0xc748c205190870b4e890036f373e30556929f7fbf3db8644c998a652c1996dbd to Ethereum Emergency Brakes multisig 0x73b047fe6337183A454c5217241D780a932777bD on BuybackExecutor 0x6c213ca5A10Cc26548C742229569B4AeD2A9C9B7",
                BUYBACK_EXECUTOR,
                abi.encodeCall(
                    IAccessControl.grantRole, (BUYBACK_EXECUTOR_EMERGENCY_ROLE, Addresses.EMERGENCY_BRAKES_MULTISIG)
                )
            )
            .directCall(
                "Grant Buybacks.MANAGER_ROLE 0x24bec1f1283f989ed510b4d89bc7ef5002f20db1b60c1b3192336791c868543e to Treasury Management Committee 0xa02FC823cCE0D016bD7e17ac684c9abAb2d6D647 on BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889",
                BUYBACK_ALLOCATOR,
                abi.encodeCall(IAccessControl.grantRole, (BUYBACKS_MANAGER_ROLE, TREASURY_MANAGEMENT_COMMITTEE))
            )
            .directCall(
                "Call activate() on BuybackAllocator 0xAA568141c051f2D1132b110f8391F18D48E8D889",
                BUYBACK_ALLOCATOR,
                abi.encodeCall(IBuybackAllocator.activate, ())
            )
            .directCall(
                "Remove UpdateStakingModuleShareLimits EVM script factory 0x0C6703F1d8D9DdfB6c6e5F57b4f7432a6500D6D8 from EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
                Addresses.EASY_TRACK,
                abi.encodeCall(IEasyTrack.removeEVMScriptFactory, (OLD_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY))
            )
            .directCall(
                "Add UpdateStakingModuleShareLimits EVM script factory 0xde3e46E3129fA4e4e3f66c9024B0A3Ad509b27a1 with validateParams permission on itself and updateModuleShares permission on Staking Router 0xFdDf38947aFB03C621C71b06C9C70bce73f12999 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
                Addresses.EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        NEW_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY,
                        EasyTrackPermissionsUtils.permission(
                                NEW_UPDATE_STAKING_MODULE_SHARE_LIMITS_FACTORY,
                                IUpdateStakingModuleShareLimits.validateParams.selector
                            ).and(Addresses.STAKING_ROUTER, IStakingRouter.updateModuleShares.selector)
                    )
                )
            )
            .directCall(
                "Add LOL stablecoins TopUpAllowedRecipients EVM script factory 0xc72d4C3e86b681D7c9EE306D41193C64D709C303 with newImmediatePayment permission on Aragon Finance 0xB9E5CBB9CA5b0d659238807E84D0176930753d86 and updateSpentAmount permission on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
                Addresses.EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        LOL_STABLECOINS_TOP_UP_FACTORY,
                        EasyTrackPermissionsUtils.permission(Addresses.FINANCE, IFinance.newImmediatePayment.selector)
                            .and(
                                LOL_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY,
                                IAllowedRecipientsRegistry.updateSpentAmount.selector
                            )
                    )
                )
            )
            .directCall(
                "Add LOL stablecoins AddAllowedRecipient EVM script factory 0xe24230619e9218C1eed3de3489a22f6BC3ce18FF with addRecipient permission on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
                Addresses.EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        LOL_STABLECOINS_ADD_RECIPIENT_FACTORY,
                        EasyTrackPermissionsUtils.permission(
                            LOL_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY,
                            IAllowedRecipientsRegistry.addRecipient.selector
                        )
                    )
                )
            )
            .directCall(
                "Add LOL stablecoins RemoveAllowedRecipient EVM script factory 0xF4d5D97C85eD18f77F99B57f55E9E11d52992632 with removeRecipient permission on LOL stablecoins AllowedRecipientsRegistry 0x8d8b35cA51e7808098afF4918C21Ce428c943F89 to EasyTrack 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea",
                Addresses.EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        LOL_STABLECOINS_REMOVE_RECIPIENT_FACTORY,
                        EasyTrackPermissionsUtils.permission(
                            LOL_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY,
                            IAllowedRecipientsRegistry.removeRecipient.selector
                        )
                    )
                )
            ).getCalls();
    }
}
