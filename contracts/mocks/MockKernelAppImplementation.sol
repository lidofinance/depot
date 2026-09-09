// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract MockKernelAppImplementationV1 {
    function version() external pure returns (uint256) {
        return 1;
    }
}

contract MockKernelAppImplementationV2 {
    function version() external pure returns (uint256) {
        return 2;
    }
}
