// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Easy Track factory changing the stake share limits of a staking module.
interface IUpdateStakingModuleShareLimits {
    struct ModuleShareParams {
        uint16 currentStakeShareLimit;
        uint16 newStakeShareLimit;
        uint16 currentPriorityExitShareThreshold;
        uint16 newPriorityExitShareThreshold;
    }

    function validateParams(ModuleShareParams calldata params) external view;
}
