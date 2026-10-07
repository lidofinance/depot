// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice NEST buyback contracts. Roles are granted through IAccessControl.
interface IBuybackExecutor {
    function setStonks(address stonks_) external;
    function stonks() external view returns (address);
}

interface IBuybackAllocator {
    function activate() external;
}
