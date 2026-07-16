// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @dev Minimal TokenManager mock that parses and executes Aragon EVM scripts.
/// EVM script format: 0x00000001 | <20b address><4b calldata length><calldata> | ...
contract MockTokenManager {
    // Aragon EVM script spec ID
    bytes4 constant SPEC_ID = 0x00000001;

    event ScriptExecuted(address indexed target, bytes calldata_);

    function forward(bytes calldata _evmScript) external {
        require(bytes4(_evmScript[:4]) == SPEC_ID, "invalid spec id");

        uint256 pos = 4;
        while (pos < _evmScript.length) {
            address target = address(bytes20(_evmScript[pos:pos + 20]));
            pos += 20;
            uint32 calldataLen = uint32(bytes4(_evmScript[pos:pos + 4]));
            pos += 4;
            bytes memory data = _evmScript[pos:pos + calldataLen];
            pos += calldataLen;

            (bool success, bytes memory ret) = target.call(data);
            require(success, string(abi.encodePacked("forward failed: ", ret)));
            emit ScriptExecuted(target, data);
        }
    }
}
