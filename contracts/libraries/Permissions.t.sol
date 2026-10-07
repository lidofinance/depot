// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {AclPermissionsUtils} from "./AclPermissions.sol";
import {PermissionsCalls} from "./Permissions.sol";
import {
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ForwardedCall,
    ForwardedCallsBuilder,
    ForwardedCallsBuilderUtils
} from "./calls-builder.sol";

contract PermissionsCallsTest is Test {
    using PermissionsCalls for VoteCallsBuilder;
    using PermissionsCalls for ForwardedCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    address private constant ACL = 0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb;
    address private constant APP = 0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5;
    address private constant ENTITY = 0xF45C77EadD434612fCD93db978B3E36B0D58eC99;
    address private constant MANAGER = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    bytes32 private constant ROLE = 0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee;

    function test_VotePermissionsKeepTheirTargetsAndArgumentOrder() external pure {
        uint256[] memory params = new uint256[](1);
        params[0] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, 21);
        VoteCallsBuilder memory builder = VoteCallsBuilderUtils.create(7);
        builder.createPermission("Create", ACL, ENTITY, APP, ROLE, MANAGER);
        builder.grantPermission("Grant", ACL, ENTITY, APP, ROLE);
        builder.grantPermissionP("Grant with params", ACL, ENTITY, APP, ROLE, params);
        builder.revokePermission("Revoke", ACL, ENTITY, APP, ROLE);
        builder.setPermissionManager("Set manager", ACL, MANAGER, APP, ROLE);
        builder.grantRole("Grant OZ role", APP, ROLE, ENTITY);
        builder.revokeRole("Revoke OZ role", APP, ROLE, ENTITY);
        VoteCall[] memory calls = builder.getCalls();

        bytes[] memory expected = _expectedPayloads();
        string[7] memory titles =
            ["Create", "Grant", "Grant with params", "Revoke", "Set manager", "Grant OZ role", "Revoke OZ role"];
        assertEq(calls.length, 7);
        for (uint256 i = 0; i < calls.length; ++i) {
            assertEq(calls[i].title, titles[i]);
            assertEq(calls[i].target, i < 5 ? ACL : APP);
            assertEq(calls[i].payload, expected[i]);
        }
    }

    function test_ForwardedPermissionsPreserveTheSamePayloads() external pure {
        uint256[] memory params = new uint256[](1);
        params[0] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, 21);
        ForwardedCallsBuilder memory builder = ForwardedCallsBuilderUtils.create(7);
        builder.createPermission("Create", ACL, ENTITY, APP, ROLE, MANAGER);
        builder.grantPermission("Grant", ACL, ENTITY, APP, ROLE);
        builder.grantPermissionP("Grant with params", ACL, ENTITY, APP, ROLE, params);
        builder.revokePermission("Revoke", ACL, ENTITY, APP, ROLE);
        builder.setPermissionManager("Set manager", ACL, MANAGER, APP, ROLE);
        builder.grantRole("Grant OZ role", APP, ROLE, ENTITY);
        builder.revokeRole("Revoke OZ role", APP, ROLE, ENTITY);
        ForwardedCall[] memory calls = builder.getCalls();

        bytes[] memory expected = _expectedPayloads();
        string[7] memory titles =
            ["Create", "Grant", "Grant with params", "Revoke", "Set manager", "Grant OZ role", "Revoke OZ role"];
        assertEq(calls.length, 7);
        for (uint256 i = 0; i < calls.length; ++i) {
            assertEq(calls[i].title, string.concat("    ", titles[i]));
            assertEq(calls[i].target, i < 5 ? ACL : APP);
            assertEq(calls[i].payload, expected[i]);
        }
    }

    function test_ParameterizedGrantKeepsTheDecisionTreeByteForByte() external pure {
        uint256[] memory params = new uint256[](4);
        params[0] = AclPermissionsUtils.ifElse(1, 2, 3);
        params[1] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, APP);
        params[2] = AclPermissionsUtils.param(2, AclPermissionsUtils.Op.LTE, 1000 ether);
        params[3] = AclPermissionsUtils.param(2, AclPermissionsUtils.Op.LTE, 100 ether);
        VoteCall[] memory calls = VoteCallsBuilderUtils.create(1)
            .grantPermissionP("Grant conditional limit", ACL, ENTITY, APP, ROLE, params).getCalls();

        uint256[] memory expectedParams = new uint256[](4);
        expectedParams[0] = 0xcc0c000000000000000000000000000000000000000000030000000200000001;
        expectedParams[1] = (uint256(1) << 240) | uint256(uint160(APP));
        expectedParams[2] = (uint256(2) << 248) | (uint256(6) << 240) | 1000 ether;
        expectedParams[3] = (uint256(2) << 248) | (uint256(6) << 240) | 100 ether;
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature(
                "grantPermissionP(address,address,bytes32,uint256[])", ENTITY, APP, ROLE, expectedParams
            )
        );
    }

    function test_EmptyParamsStayOnTheGrantPermissionPSelector() external pure {
        uint256[] memory params = new uint256[](0);
        VoteCall[] memory calls =
            VoteCallsBuilderUtils.create(1).grantPermissionP("Grant", ACL, ENTITY, APP, ROLE, params).getCalls();
        assertEq(
            calls[0].payload,
            abi.encodeWithSignature("grantPermissionP(address,address,bytes32,uint256[])", ENTITY, APP, ROLE, params)
        );
    }

    function _expectedPayloads() private pure returns (bytes[] memory payloads) {
        uint256[] memory params = new uint256[](1);
        params[0] = 0x0001000000000000000000000000000000000000000000000000000000000015;
        payloads = new bytes[](7);
        payloads[0] =
            abi.encodeWithSignature("createPermission(address,address,bytes32,address)", ENTITY, APP, ROLE, MANAGER);
        payloads[1] = abi.encodeWithSignature("grantPermission(address,address,bytes32)", ENTITY, APP, ROLE);
        payloads[2] =
            abi.encodeWithSignature("grantPermissionP(address,address,bytes32,uint256[])", ENTITY, APP, ROLE, params);
        payloads[3] = abi.encodeWithSignature("revokePermission(address,address,bytes32)", ENTITY, APP, ROLE);
        payloads[4] = abi.encodeWithSignature("setPermissionManager(address,address,bytes32)", MANAGER, APP, ROLE);
        payloads[5] = abi.encodeWithSignature("grantRole(bytes32,address)", ROLE, ENTITY);
        payloads[6] = abi.encodeWithSignature("revokeRole(bytes32,address)", ROLE, ENTITY);
    }
}
