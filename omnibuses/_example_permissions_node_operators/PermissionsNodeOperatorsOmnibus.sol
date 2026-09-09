// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {AclPermissionsUtils} from "contracts/libraries/AclPermissions.sol";
import {AgentCalls} from "contracts/libraries/Agent.sol";
import {DualGovernanceCalls} from "contracts/libraries/DualGovernance.sol";
import {PermissionsCalls} from "contracts/libraries/Permissions.sol";
import {NodeOperatorsCalls} from "contracts/libraries/NodeOperators.sol";
import {
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils,
    ForwardedCallsBuilder,
    ForwardedCallsBuilderUtils
} from "contracts/libraries/calls-builder.sol";

/// @notice Local fork example: renew a scoped permission and update one curated operator.
contract PermissionsNodeOperatorsOmnibus is OmnibusBase {
    using AgentCalls for ProposalCallsBuilder;
    using DualGovernanceCalls for VoteCallsBuilder;
    using PermissionsCalls for ForwardedCallsBuilder;
    using NodeOperatorsCalls for ForwardedCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address public constant ACL = 0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb;
    address public constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    address public constant DUAL_GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address public constant NODE_OPERATORS_REGISTRY = 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5;
    address public constant STAKING_ROUTER = 0xFdDf38947aFB03C621C71b06C9C70bce73f12999;
    address public constant KEYS_MANAGER = 0xF45C77EadD434612fCD93db978B3E36B0D58eC99;
    address public constant NEW_REWARD_ADDRESS = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    bytes32 public constant MANAGE_SIGNING_KEYS = 0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee;
    uint256 public constant NODE_OPERATOR_ID = 21;
    uint256 public constant STAKING_MODULE_ID = 1;
    uint256 public constant TARGET_LIMIT_MODE = 1;
    uint256 public constant TARGET_VALIDATORS_COUNT = 0;
    string public constant NEW_NAME = "Consensys (Depot test)";
    string public constant ITEM_TITLE = "Renew the Consensys key permission and update its operator settings";
    string internal constant PROPOSAL_DESCRIPTION =
        "Renew the Consensys key permission for operator 21, rename it to Consensys (Depot test), direct its rewards to Aragon Agent, set a soft target limit of zero and deactivate it. Local fork example only.";
    uint256 private constant VOTE_ITEMS_COUNT = 1;

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        ProposalCallsBuilder memory proposal = ProposalCallsBuilderUtils.create(6)
            .forward(
                "Revoke the previous key permission",
                AGENT,
                ForwardedCallsBuilderUtils.create(1)
                    .revokePermission(
                        "Revoke the previous key permission",
                        ACL,
                        KEYS_MANAGER,
                        NODE_OPERATORS_REGISTRY,
                        MANAGE_SIGNING_KEYS
                    )
            )
            .forward(
                "Restore the key permission for operator 21",
                AGENT,
                ForwardedCallsBuilderUtils.create(1)
                    .grantPermissionP(
                        "Restore the key permission for operator 21",
                        ACL,
                        KEYS_MANAGER,
                        NODE_OPERATORS_REGISTRY,
                        MANAGE_SIGNING_KEYS,
                        _permissionParams()
                    )
            )
            .forward(
                "Rename the operator",
                AGENT,
                ForwardedCallsBuilderUtils.create(1)
                    .setName("Rename the operator", NODE_OPERATORS_REGISTRY, NODE_OPERATOR_ID, NEW_NAME)
            )
            .forward(
                "Change the reward address",
                AGENT,
                ForwardedCallsBuilderUtils.create(1)
                    .setRewardAddress(
                        "Change the reward address", NODE_OPERATORS_REGISTRY, NODE_OPERATOR_ID, NEW_REWARD_ADDRESS
                    )
            )
            .forward(
                "Set the soft target limit to zero",
                AGENT,
                ForwardedCallsBuilderUtils.create(1)
                    .updateTargetValidatorsLimits(
                        "Set the soft target limit to zero",
                        STAKING_ROUTER,
                        STAKING_MODULE_ID,
                        NODE_OPERATOR_ID,
                        TARGET_LIMIT_MODE,
                        TARGET_VALIDATORS_COUNT
                    )
            )
            .forward(
                "Deactivate the operator",
                AGENT,
                ForwardedCallsBuilderUtils.create(1)
                    .deactivate("Deactivate the operator", NODE_OPERATORS_REGISTRY, NODE_OPERATOR_ID)
            );

        return VoteCallsBuilderUtils.create(VOTE_ITEMS_COUNT)
            .submitProposal(ITEM_TITLE, PROPOSAL_DESCRIPTION, DUAL_GOVERNANCE, proposal)
            .getCalls();
    }

    function _permissionParams() private pure returns (uint256[] memory params) {
        params = new uint256[](1);
        params[0] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, uint240(NODE_OPERATOR_ID));
    }
}
