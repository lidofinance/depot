// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice The upgrade surface of Lido's OssifiableProxy.
interface IOssifiableProxy {
    function proxy__upgradeTo(address newImplementation_) external;
    function proxy__getImplementation() external view returns (address);
    function proxy__getAdmin() external view returns (address);
}
