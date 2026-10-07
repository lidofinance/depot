// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {AclPermissionsUtils} from "contracts/libraries/AclPermissions.sol";
import {PermissionsCalls} from "contracts/libraries/Permissions.sol";
import {VoteCall, VoteCallsBuilder, VoteCallsBuilderUtils} from "contracts/libraries/calls-builder.sol";

/// @notice Grant the Hoodi Sandbox keys manager access exclusively to node operator 1 through Voting.
contract Omnibus_2026_01_26_hoodi is OmnibusBase {
    using PermissionsCalls for VoteCallsBuilder;
    using VoteCallsBuilderUtils for VoteCallsBuilder;

    address public constant VOTING = 0x49B3512c44891bef83F8967d075121Bd1b07a01B;
    address public constant ACL = 0x78780e70Eae33e2935814a327f7dB6c01136cc62;
    address public constant NODE_OPERATORS_REGISTRY = 0x682E94d2630846a503BDeE8b6810DF71C9806891;
    address public constant KEYS_MANAGER = 0xc8195bb2851d7129D9100af9d65Bd448A6dE11eF;
    bytes32 public constant MANAGE_SIGNING_KEYS = 0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee;
    uint256 public constant NODE_OPERATOR_ID = 1;
    uint256 public constant VOTE_ITEMS_COUNT = 1;
    string public constant ITEM_TITLE =
        "On Hoodi, grant `MANAGE_SIGNING_KEYS` to `0xc8195bb2851d7129D9100af9d65Bd448A6dE11eF` in the Sandbox Node Operators Registry (`0x682E94d2630846a503BDeE8b6810DF71C9806891`), restricted exclusively to node operator ID `1`.";

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        uint256[] memory params = new uint256[](1);
        params[0] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, uint240(NODE_OPERATOR_ID));

        return VoteCallsBuilderUtils.create(VOTE_ITEMS_COUNT)
            .grantPermissionP(ITEM_TITLE, ACL, KEYS_MANAGER, NODE_OPERATORS_REGISTRY, MANAGE_SIGNING_KEYS, params)
            .getCalls();
    }
}
