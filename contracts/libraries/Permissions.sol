// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IACL} from "../interfaces/IACL.sol";
import {IAccessControl} from "../interfaces/IAccessControl.sol";
import {
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ForwardedCallsBuilder,
    ForwardedCallsBuilderUtils
} from "./calls-builder.sol";

library PermissionsCalls {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;

    function createPermission(
        VoteCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role,
        address manager
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.createPermission, (entity, app, role, manager)));
    }

    function createPermission(
        ForwardedCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role,
        address manager
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.createPermission, (entity, app, role, manager)));
    }

    function grantPermission(
        VoteCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.grantPermission, (entity, app, role)));
    }

    function grantPermission(
        ForwardedCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.grantPermission, (entity, app, role)));
    }

    function grantPermissionP(
        VoteCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role,
        uint256[] memory params
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.grantPermissionP, (entity, app, role, params)));
    }

    function grantPermissionP(
        ForwardedCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role,
        uint256[] memory params
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.grantPermissionP, (entity, app, role, params)));
    }

    function revokePermission(
        VoteCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.revokePermission, (entity, app, role)));
    }

    function revokePermission(
        ForwardedCallsBuilder memory self,
        string memory title,
        address acl,
        address entity,
        address app,
        bytes32 role
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.revokePermission, (entity, app, role)));
    }

    function setPermissionManager(
        VoteCallsBuilder memory self,
        string memory title,
        address acl,
        address manager,
        address app,
        bytes32 role
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.setPermissionManager, (manager, app, role)));
    }

    function setPermissionManager(
        ForwardedCallsBuilder memory self,
        string memory title,
        address acl,
        address manager,
        address app,
        bytes32 role
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, acl, abi.encodeCall(IACL.setPermissionManager, (manager, app, role)));
    }

    function grantRole(
        VoteCallsBuilder memory self,
        string memory title,
        address target,
        bytes32 role,
        address account
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, target, abi.encodeCall(IAccessControl.grantRole, (role, account)));
    }

    function grantRole(
        ForwardedCallsBuilder memory self,
        string memory title,
        address target,
        bytes32 role,
        address account
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, target, abi.encodeCall(IAccessControl.grantRole, (role, account)));
    }

    function revokeRole(
        VoteCallsBuilder memory self,
        string memory title,
        address target,
        bytes32 role,
        address account
    ) internal pure returns (VoteCallsBuilder memory) {
        return self.directCall(title, target, abi.encodeCall(IAccessControl.revokeRole, (role, account)));
    }

    function revokeRole(
        ForwardedCallsBuilder memory self,
        string memory title,
        address target,
        bytes32 role,
        address account
    ) internal pure returns (ForwardedCallsBuilder memory) {
        return self.directCall(title, target, abi.encodeCall(IAccessControl.revokeRole, (role, account)));
    }
}
