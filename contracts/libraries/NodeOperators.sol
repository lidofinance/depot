// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {INodeOperatorsRegistry} from "../interfaces/INodeOperatorsRegistry.sol";
import {IStakingRouter} from "../interfaces/IStakingRouter.sol";
import {ForwardedCallsBuilder, ForwardedCallsBuilderUtils} from "./calls-builder.sol";

library NodeOperatorsCalls {
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    function setName(
        ForwardedCallsBuilder memory self,
        string memory title,
        address registry,
        uint256 nodeOperatorId,
        string memory name
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title, registry, abi.encodeCall(INodeOperatorsRegistry.setNodeOperatorName, (nodeOperatorId, name))
        );
    }

    function setRewardAddress(
        ForwardedCallsBuilder memory self,
        string memory title,
        address registry,
        uint256 nodeOperatorId,
        address rewardAddress
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title,
            registry,
            abi.encodeCall(INodeOperatorsRegistry.setNodeOperatorRewardAddress, (nodeOperatorId, rewardAddress))
        );
    }

    function deactivate(
        ForwardedCallsBuilder memory self,
        string memory title,
        address registry,
        uint256 nodeOperatorId
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title, registry, abi.encodeCall(INodeOperatorsRegistry.deactivateNodeOperator, (nodeOperatorId))
        );
    }

    function updateTargetValidatorsLimits(
        ForwardedCallsBuilder memory self,
        string memory title,
        address stakingRouter,
        uint256 stakingModuleId,
        uint256 nodeOperatorId,
        uint256 targetLimitMode,
        uint256 targetLimit
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(
            title,
            stakingRouter,
            abi.encodeCall(
                IStakingRouter.updateTargetValidatorsLimits,
                (stakingModuleId, nodeOperatorId, targetLimitMode, targetLimit)
            )
        );
    }
}
