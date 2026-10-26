// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice The OpenZeppelin AccessControl surface used by omnibuses.
/// @dev Lido governance itself runs on the Aragon ACL, but most contracts deployed
///      around the protocol use OpenZeppelin roles — those are granted through this interface.
interface IAccessControl {
    function grantRole(bytes32 role, address account) external;
    function revokeRole(bytes32 role, address account) external;
    function hasRole(bytes32 role, address account) external view returns (bool);
}
