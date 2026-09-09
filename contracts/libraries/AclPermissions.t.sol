// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {AclPermissionsUtils} from "./AclPermissions.sol";

contract AclPermissionsTest is Test {
    address private constant STETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

    function test_SingleComparison() external pure {
        // vote #201: MANAGE_SIGNING_KEYS only for node operator 21
        assertEq(
            AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, 21),
            0x0001000000000000000000000000000000000000000000000000000000000015
        );
    }

    function test_AddressValue() external pure {
        // vote #195, node 1: _token == stETH
        assertEq(
            AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, STETH),
            0x000100000000000000000000ae7ab96520de3a18e5e111b5eaab095312d7fe84
        );
    }

    function test_AmountLimit() external pure {
        // vote #195, node 2: _amount <= 1000 stETH
        assertEq(
            AclPermissionsUtils.param(2, AclPermissionsUtils.Op.LTE, 1000 ether),
            0x02060000000000000000000000000000000000000000003635c9adc5dea00000
        );
    }

    function test_IfElsePacksThreeIndexes() external pure {
        // vote #195, node 0: if (1) then (2) else (3)
        assertEq(
            AclPermissionsUtils.ifElse(1, 2, 3), 0xcc0c000000000000000000000000000000000000000000030000000200000001
        );
    }

    function test_LogicPacksTwoIndexes() external pure {
        assertEq(
            AclPermissionsUtils.logic(AclPermissionsUtils.Op.AND, 1, 2),
            0xcc09000000000000000000000000000000000000000000000000000200000001
        );
    }

    function test_LogicRejectsComparisonOps() external {
        vm.expectRevert("AclPermissions: not a logic op");
        this.logicWithComparison();
    }

    function logicWithComparison() external pure returns (uint256) {
        return AclPermissionsUtils.logic(AclPermissionsUtils.Op.EQ, 1, 2);
    }
}
