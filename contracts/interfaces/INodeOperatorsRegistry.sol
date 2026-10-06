// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface INodeOperatorsRegistry {
    function addNodeOperator(string calldata _name, address _rewardAddress) external returns (uint256 id);
}
