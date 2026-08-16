// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Router distributing oracle reports; its manager is set by DAO vote.
interface IOracleRouter {
    function setManager(address manager_) external;
    function manager() external view returns (address);
}
