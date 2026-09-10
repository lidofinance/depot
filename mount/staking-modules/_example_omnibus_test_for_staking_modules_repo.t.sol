// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

contract OmnibusForkSmokeTest is Test {
    address public constant Lucker = 0x0000000000000000000000000000000000000777;

    function setUp() external {
        // the repo tests fork on their own, `RPC_URL` points to the depot fork node
        vm.createSelectFork(vm.envString("RPC_URL"));
    }

    function testFork_Test_CI_Integration() external view {
        assertEq(block.chainid, 1);
        assertGt(block.number, 0);
        assertGe(Lucker.balance, 0);
    }
}
