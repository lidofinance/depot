// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

contract MockSnapshotCallTarget {
    bool public called;

    function perform_call() external {
        require(!called);
        called = true;
    }
}
