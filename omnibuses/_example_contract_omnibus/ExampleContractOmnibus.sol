// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "contracts/OmnibusBase.sol";
import "contracts/libraries/calls-builder.sol";

import {IFinance} from "contracts/interfaces/IFinance.sol";
import {IEasyTrack} from "contracts/interfaces/IEasyTrack.sol";
import {INodeOperatorsRegistry} from "contracts/interfaces/INodeOperatorsRegistry.sol";

interface IRegistry {
    function updateSpentAmount(uint256 _payoutAmount) external;
    function addRecipient(address _recipient, string memory _title) external;
    function removeRecipient(address _recipient) external;
}

interface IStETH {
    function submit(address _referral) external payable returns (uint256);
}

interface IStakingRouter {
    enum StakingModuleStatus {
        Active, // deposits and rewards allowed
        DepositsPaused, // deposits NOT allowed, rewards allowed
        Stopped // deposits and rewards NOT allowed
    }

    function setStakingModuleStatus(uint256 _stakingModuleId, StakingModuleStatus _status) external;
}

interface IOmnibusVoteStateValidator {
    function validateStateBeforeVote() external;
    function validateStateAfterVote() external;
}

/// @title ExampleContractOmnibus
contract ExampleContractOmnibus is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    uint256 public constant VOTE_ITEMS_COUNT = 11;
    uint256 public constant DG_PROPOSAL_CALLS_COUNT = 3;

    address public constant LDO = 0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32;
    address public constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address public constant FINANCE = 0xB9E5CBB9CA5b0d659238807E84D0176930753d86;
    address public constant EASY_TRACK = 0xF0211b7660680B49De1A7E9f25C65660F0a13Fea;
    address public constant DUAL_GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address public constant CURATED_MODULE = 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5;
    address public constant STAKING_ROUTER = 0xFdDf38947aFB03C621C71b06C9C70bce73f12999;
    address public constant STETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

    address public constant REWARDS_STETH_TOP_UP_FACTORY = 0x85d703B2A4BaD713b596c647badac9A1e95bB03d;
    address public constant REWARDS_STETH_ADD_RECIPIENT_FACTORY = 0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C;
    address public constant REWARDS_STETH_REMOVE_RECIPIENT_FACTORY = 0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E;
    address public constant REWARDS_STETH_ALLOWED_RECIPIENTS_REGISTRY = 0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A;
    address public constant REWARDS_STETH_TRUSTED_CALLER = 0x87D93d9B2C672bf9c9642d853a8682546a5012B5;

    address public constant REWARDS_LDO_TOP_UP_FACTORY = 0x200dA0b6a9905A377CF8D469664C65dB267009d1;
    address public constant REWARDS_LDO_ADD_RECIPIENT_FACTORY = 0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252;
    address public constant REWARDS_LDO_REMOVE_RECIPIENT_FACTORY = 0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7;

    address public constant ATC_STABLES_MULTISIG = 0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956;
    uint256 public constant ATC_STABLES_LDO_TRANSFER_AMOUNT = 110_000 * 10 ** 18;

    address public constant PML_MULTISIG = 0x17F6b2C738a63a8D3A113a228cfd0b373244633D;
    uint256 public constant PML_LDO_TRANSFER_AMOUNT = 180_000 * 10 ** 18;

    address public constant A41_REWARD_ADDRESS = 0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7;
    address public constant DEVELP_REWARD_ADDRESS = 0x0a6a0b60fFeF196113b3530781df6e747DdC565e;
    address public constant EBUNKER_REWARD_ADDRESS = 0x2A2245d1f47430b9f60adCFC63D158021E80A728;
    address public constant GATEWAY_REWARD_ADDRESS = 0x78CEE97C23560279909c0215e084dB293F036774;
    address public constant NUMIC_REWARD_ADDRESS = 0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC;
    address public constant PARAFI_REWARD_ADDRESS = 0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7;
    address public constant ROCKAWAY_REWARD_ADDRESS = 0xcA6817DAb36850D58375A10c78703CE49d41D25a;
    address private constant ZERO_ADDRESS = address(0);

    string internal constant DG_PROPOSAL_DESCRIPTION = "11. Submit proposal to Dual Governance with the following calls:\n"
        "  11.1. Forward call to Agent update staking limit on\n" "  11.2. Execute calls via Agent to transfer ETH\n"
        "  11.3. Forward 7 calls via Aragon Agent to add new Node Operators to the Curated Module\n"
        "    11.3.1. Add node operator \"A41\" with the reward address 0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7 to Curated module\n"
        "    11.3.2. Add node operator \"Develp GmbH\" with the reward address 0x0a6a0b60fFeF196113b3530781df6e747DdC565e to Curated module\n"
        "    11.3.3. Add node operator \"Ebunker\" with the reward address 0x2A2245d1f47430b9f60adCFC63D158021E80A728 to Curated module\n"
        "    11.3.4. Add node operator \"Gateway.fm AS\" with the reward address 0x78CEE97C23560279909c0215e084dB293F036774 to Curated module\n"
        "    11.3.5. Add node operator \"Numic\" with the reward address 0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC to Curated module\n"
        "    11.3.6. Add node operator \"ParaFi Technologies LLC\" with the reward address 0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7 to Curated module\n"
        "    11.3.7. Add node operator \"RockawayX Infra\" with the reward address 0xcA6817DAb36850D58375A10c78703CE49d41D25a to Curated module";

    address public immutable ACTION_VALIDATOR;

    constructor(address actionValidator) OmnibusBase(VOTING) {
        require(actionValidator != ZERO_ADDRESS, "Action validator is zero");
        ACTION_VALIDATOR = actionValidator;
    }

    function getOmnibusCalls() public view override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create({
            callsCount: VOTE_ITEMS_COUNT
        }).directCall(
                "Capture LDO balance before vote execution",
                ACTION_VALIDATOR,
                abi.encodeCall(IOmnibusVoteStateValidator.validateStateBeforeVote, ())
            )
            .directCall(
                "Add TopUpEVMScriptFactory with address 0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
                EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        REWARDS_STETH_TOP_UP_FACTORY,
                        abi.encodePacked(
                            FINANCE,
                            IFinance.newImmediatePayment.selector,
                            REWARDS_STETH_ALLOWED_RECIPIENTS_REGISTRY,
                            IRegistry.updateSpentAmount.selector
                        )
                    )
                )
            )
            .directCall(
                "Add AddRecipientEVMScriptFactory with address 0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
                EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        REWARDS_STETH_ADD_RECIPIENT_FACTORY,
                        abi.encodePacked(REWARDS_STETH_ALLOWED_RECIPIENTS_REGISTRY, IRegistry.addRecipient.selector)
                    )
                )
            )
            .directCall(
                "Add RemoveRecipientEVMScriptFactory with address 0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
                EASY_TRACK,
                abi.encodeCall(
                    IEasyTrack.addEVMScriptFactory,
                    (
                        REWARDS_STETH_REMOVE_RECIPIENT_FACTORY,
                        abi.encodePacked(REWARDS_STETH_ALLOWED_RECIPIENTS_REGISTRY, IRegistry.removeRecipient.selector)
                    )
                )
            )
            .directCall(
                "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
                FINANCE,
                abi.encodeCall(
                    IFinance.newImmediatePayment,
                    (
                        LDO,
                        ATC_STABLES_MULTISIG,
                        ATC_STABLES_LDO_TRANSFER_AMOUNT,
                        "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig"
                    )
                )
            )
            .directCall(
                "Remove TopUpEVMScriptFactory with address 0x200dA0b6a9905A377CF8D469664C65dB267009d1",
                EASY_TRACK,
                abi.encodeCall(IEasyTrack.removeEVMScriptFactory, (REWARDS_LDO_TOP_UP_FACTORY))
            )
            .directCall(
                "Remove AddRecipientEVMScriptFactory with address 0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
                EASY_TRACK,
                abi.encodeCall(IEasyTrack.removeEVMScriptFactory, (REWARDS_LDO_ADD_RECIPIENT_FACTORY))
            )
            .directCall(
                "Remove RemoveRecipientEVMScriptFactory with address 0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
                EASY_TRACK,
                abi.encodeCall(IEasyTrack.removeEVMScriptFactory, (REWARDS_LDO_REMOVE_RECIPIENT_FACTORY))
            )
            .directCall(
                "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
                FINANCE,
                abi.encodeCall(
                    IFinance.newImmediatePayment,
                    (
                        LDO,
                        PML_MULTISIG,
                        PML_LDO_TRANSFER_AMOUNT,
                        "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig"
                    )
                )
            )
            .directCall(
                "Validate LDO balance after vote execution",
                ACTION_VALIDATOR,
                abi.encodeCall(IOmnibusVoteStateValidator.validateStateAfterVote, ())
            )
            .submitCalls(
                "Submit proposal to Dual Governance with the following calls:",
                DG_PROPOSAL_DESCRIPTION,
                DUAL_GOVERNANCE,
                ProposalCallsBuilderUtils.create({
                    callsCount: DG_PROPOSAL_CALLS_COUNT
                }).forwardCall(
                        "11.1. Forward call to Agent update staking limit on",
                        AGENT,
                        STAKING_ROUTER,
                        abi.encodeCall(
                            IStakingRouter.setStakingModuleStatus,
                            (1, IStakingRouter.StakingModuleStatus.DepositsPaused)
                        )
                    )
                    .executeCall(
                        "11.2. Execute calls via Agent to transfer ETH",
                        AGENT,
                        STETH,
                        100 wei,
                        abi.encodeCall(IStETH.submit, (AGENT))
                    )
                    .forwardCalls(
                        "11.3. Forward 7 calls via Aragon Agent to add new Node Operators to the Curated Module",
                        AGENT,
                        ForwardedCallsBuilderUtils.create({
                            callsCount: 7
                        }).directCall(
                                "11.3.1. Add node operator \"A41\" with the reward address 0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7 to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(INodeOperatorsRegistry.addNodeOperator, ("A41", A41_REWARD_ADDRESS))
                            )
                            .directCall(
                                "11.3.2. Add node operator \"Develp GmbH\" with the reward address 0x0a6a0b60fFeF196113b3530781df6e747DdC565e to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(
                                    INodeOperatorsRegistry.addNodeOperator, ("Develp GmbH", DEVELP_REWARD_ADDRESS)
                                )
                            )
                            .directCall(
                                "11.3.3. Add node operator \"Ebunker\" with the reward address 0x2A2245d1f47430b9f60adCFC63D158021E80A728 to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(
                                    INodeOperatorsRegistry.addNodeOperator, ("Ebunker", EBUNKER_REWARD_ADDRESS)
                                )
                            )
                            .directCall(
                                "11.3.4. Add node operator \"Gateway.fm AS\" with the reward address 0x78CEE97C23560279909c0215e084dB293F036774 to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(
                                    INodeOperatorsRegistry.addNodeOperator, ("Gateway.fm AS", GATEWAY_REWARD_ADDRESS)
                                )
                            )
                            .directCall(
                                "11.3.5. Add node operator \"Numic\" with the reward address 0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(INodeOperatorsRegistry.addNodeOperator, ("Numic", NUMIC_REWARD_ADDRESS))
                            )
                            .directCall(
                                "11.3.6. Add node operator \"ParaFi Technologies LLC\" with the reward address 0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7 to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(
                                    INodeOperatorsRegistry.addNodeOperator,
                                    ("ParaFi Technologies LLC", PARAFI_REWARD_ADDRESS)
                                )
                            )
                            .directCall(
                                "11.3.7. Add node operator \"RockawayX Infra\" with the reward address 0xcA6817DAb36850D58375A10c78703CE49d41D25a to Curated module",
                                CURATED_MODULE,
                                abi.encodeCall(
                                    INodeOperatorsRegistry.addNodeOperator, ("RockawayX Infra", ROCKAWAY_REWARD_ADDRESS)
                                )
                            )
                    )
            ).getCalls();
    }
}
