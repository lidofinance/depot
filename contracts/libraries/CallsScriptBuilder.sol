// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

struct CallsScriptBuilder {
    bytes _result;
}

library CallsScriptBuilderUtils {
    bytes4 internal constant SPEC_ID = 0x00000001;

    function getResult(CallsScriptBuilder memory self) internal pure returns (bytes memory) {
        return self._result;
    }

    function create() internal pure returns (CallsScriptBuilder memory res) {
        res._result = bytes.concat(SPEC_ID);
    }

    function create(address to, bytes memory data) internal pure returns (CallsScriptBuilder memory res) {
        res = addCall(create(), to, data);
    }

    function addCall(
        CallsScriptBuilder memory self,
        address to,
        bytes memory data
    ) internal pure returns (CallsScriptBuilder memory) {
        self._result = bytes.concat(self._result, bytes20(to), bytes4(uint32(data.length)), data);
        return self;
    }
}
