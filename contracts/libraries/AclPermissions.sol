// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Encodes the parameters of an Aragon ACL permission (`IACL.grantPermissionP`).
///
/// @dev A parametrised permission is a small program the ACL evaluates on every call: an array
///      of nodes, each packed into one `uint256` as `argId (8 bits) | op (8 bits) | value (240 bits)`.
///      `argId` below 200 selects the argument of the guarded call to compare against; the ids
///      above are special (block number, timestamp, logic op, ...). A logic node refers to other
///      nodes by their index in the array, packed into its value.
///
///      Indexes are the dangerous part: a wrong one still encodes into a valid number that
///      compiles, deploys and grants a different permission. The TypeScript test decodes the
///      stored parameters back and asserts them — keep the tree small and the test explicit.
///
///      Mirrors `utils/permission_parameters.py` of the `scripts` repository; op numbers are those
///      of the deployed ACL implementation 0x9f3b9198911054b122fdb865f8a5ac516201c339.
///
/// Usage:
///
/// ```solidity
/// uint256[] memory params = new uint256[](1);
/// params[0] = AclPermissionsUtils.param(0, Op.EQ, NODE_OPERATOR_ID);
/// ```
library AclPermissionsUtils {
    enum Op {
        NONE,
        EQ,
        NEQ,
        GT,
        LT,
        GTE,
        LTE,
        RET,
        NOT,
        AND,
        OR,
        XOR,
        IF_ELSE
    }

    uint8 internal constant BLOCK_NUMBER_PARAM_ID = 200;
    uint8 internal constant TIMESTAMP_PARAM_ID = 201;
    uint8 internal constant ORACLE_PARAM_ID = 203;
    uint8 internal constant LOGIC_OP_PARAM_ID = 204;
    uint8 internal constant PARAM_VALUE_PARAM_ID = 205;

    /// @notice Compares argument `argId` of the guarded call with `value`.
    function param(uint8 argId, Op op, uint240 value) internal pure returns (uint256) {
        return (uint256(argId) << 248) | (uint256(uint8(op)) << 240) | uint256(value);
    }

    /// @notice Same as above for an address value.
    function param(uint8 argId, Op op, address value) internal pure returns (uint256) {
        return param(argId, op, uint240(uint160(value)));
    }

    /// @notice `if (nodes[condition]) nodes[success] else nodes[failure]`; indexes are into the params array.
    function ifElse(uint32 condition, uint32 success, uint32 failure) internal pure returns (uint256) {
        uint240 value = uint240(condition) | (uint240(success) << 32) | (uint240(failure) << 64);
        return param(LOGIC_OP_PARAM_ID, Op.IF_ELSE, value);
    }

    /// @notice `nodes[left] <op> nodes[right]` for `AND`, `OR`, `XOR`; `right` is ignored for `NOT`.
    function logic(Op op, uint32 left, uint32 right) internal pure returns (uint256) {
        require(op == Op.AND || op == Op.OR || op == Op.XOR || op == Op.NOT, "AclPermissions: not a logic op");
        return param(LOGIC_OP_PARAM_ID, op, uint240(left) | (uint240(right) << 32));
    }
}
