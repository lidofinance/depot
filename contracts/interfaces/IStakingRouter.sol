// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice The staking module management surface used by omnibuses.
interface IStakingRouter {
    function updateModuleShares(
        uint256 _stakingModuleId,
        uint16 _stakeShareLimit,
        uint16 _priorityExitShareThreshold
    ) external;
}
