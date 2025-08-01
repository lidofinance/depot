// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DGRegressionTestSetup} from "../utils/integration-tests.sol";

import {LidoUtils} from "../utils/lido-utils.sol";

contract DGProposalOperationsRegressionTest is DGRegressionTestSetup {
    using LidoUtils for LidoUtils.Context;
    address public constant Lucker = 0x0000000000000000000000000000000000000777;

    function setUp() external {
        _loadOrDeployDGSetup();
    }

    function testFork_Test_CI_Integration() external {
        uint256 balance = _lido.ldoToken.balanceOf(Lucker);
        assertEq(balance, 10000000000000000000000);
    }
}