// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IForwarder} from "../interfaces/IForwarder.sol";
import {IGovernance, ExternalCall} from "../interfaces/IGovernance.sol";

import {CallsScriptBuilder, CallsScriptBuilderUtils} from "./CallsScriptBuilder.sol";

error InvalidCallsCount(uint256 callsCount);

struct VoteCall {
    string title;
    address target;
    bytes payload;
}

struct VoteCallsBuilder {
    uint256 _addedCallsCount;
    VoteCall[] _calls;
}

library VoteCallsBuilderUtils {
    using CallsScriptBuilderUtils for CallsScriptBuilder;

    function create(uint256 callsCount) internal pure returns (VoteCallsBuilder memory res) {
        res._calls = new VoteCall[](callsCount);
    }

    function directCall(VoteCallsBuilder memory self, string memory title, address target, bytes memory payload)
        internal
        pure
        returns (VoteCallsBuilder memory)
    {
        _addCall(self, title, target, payload);
        return self;
    }

    function submitCalls(
        VoteCallsBuilder memory self,
        string memory title,
        address governance,
        ProposalCallsBuilder memory proposalCallsBuilder
    ) internal pure returns (VoteCallsBuilder memory) {
        return submitCalls(self, title, governance, ProposalCallsBuilderUtils.getCalls(proposalCallsBuilder));
    }

    function submitCalls(
        VoteCallsBuilder memory self,
        string memory title,
        address governance,
        ProposalCall[] memory submittedCalls
    ) internal pure returns (VoteCallsBuilder memory) {
        ExternalCall[] memory externalCalls = new ExternalCall[](submittedCalls.length);

        string memory metadata = title;
        for (uint256 i = 0; i < submittedCalls.length; ++i) {
            ProposalCall memory proposalCall = submittedCalls[i];
            metadata = string(abi.encodePacked(metadata, "\n", proposalCall.title));
            externalCalls[i] = ExternalCall(proposalCall.target, proposalCall.value, proposalCall.payload);
        }

        _addCall(self, title, governance, abi.encodeCall(IGovernance.submitProposal, (externalCalls, metadata)));

        return self;
    }

    function getCalls(VoteCallsBuilder memory self) internal pure returns (VoteCall[] memory) {
        if (self._calls.length != self._addedCallsCount) {
            revert InvalidCallsCount(self._calls.length);
        }
        return self._calls;
    }

    // ---
    // Private Methods
    // ---

    function _addCall(VoteCallsBuilder memory self, string memory title, address target, bytes memory payload)
        private
        pure
    {
        self._calls[self._addedCallsCount] = VoteCall(title, target, payload);
        self._addedCallsCount += 1;
    }
}

struct ForwardedCall {
    string title;
    address target;
    bytes payload;
}

struct ForwardedCallsBuilder {
    uint256 _addedCallsCount;
    ForwardedCall[] _calls;
}

library ForwardedCallsBuilderUtils {
    function create(uint256 callsCount) internal pure returns (ForwardedCallsBuilder memory res) {
        res._calls = new ForwardedCall[](callsCount);
    }

    function directCall(ForwardedCallsBuilder memory self, string memory title, address target, bytes memory payload)
        internal
        pure
        returns (ForwardedCallsBuilder memory)
    {
        self._calls[self._addedCallsCount] = ForwardedCall(string(abi.encodePacked("    ", title)), target, payload);
        self._addedCallsCount += 1;
        return self;
    }

    function getCalls(ForwardedCallsBuilder memory self) internal pure returns (ForwardedCall[] memory) {
        // TODO: add length validation
        return self._calls;
    }
}

struct ProposalCall {
    string title;
    address target;
    uint96 value;
    bytes payload;
}

struct ProposalCallsBuilder {
    uint256 _addedCallsCount;
    ProposalCall[] _calls;
}

library ProposalCallsBuilderUtils {
    using CallsScriptBuilderUtils for CallsScriptBuilder;

    function getCalls(ProposalCallsBuilder memory self) internal pure returns (ProposalCall[] memory) {
        return _getCalls(self);
    }

    function create(uint256 callsCount) internal pure returns (ProposalCallsBuilder memory res) {
        res._calls = new ProposalCall[](callsCount);
    }

    function directCallWithValue(
        ProposalCallsBuilder memory self,
        string memory title,
        address target,
        uint256 value,
        bytes memory payload
    ) internal pure returns (ProposalCallsBuilder memory) {
        _addCallWithValue(self, title, target, value, payload);
        return self;
    }

    function directCall(ProposalCallsBuilder memory self, string memory title, address target, bytes memory payload)
        internal
        pure
        returns (ProposalCallsBuilder memory)
    {
        _addCallWithValue(self, title, target, 0, payload);
        return self;
    }

    function executeCall(
        ProposalCallsBuilder memory self,
        string memory title,
        address executor,
        address target,
        uint256 value,
        bytes memory payload
    ) internal pure returns (ProposalCallsBuilder memory) {
        _addCallWithValue(self, title, executor, 0, abi.encodeCall(IForwarder.execute, (target, value, payload)));

        return self;
    }

    function forwardCall(
        ProposalCallsBuilder memory self,
        string memory title,
        address forwarder,
        address target,
        bytes memory payload
    ) internal pure returns (ProposalCallsBuilder memory) {
        bytes memory forwardingEVMScript = CallsScriptBuilderUtils.create(target, payload).getResult();
        _addCallWithValue(self, title, forwarder, 0, abi.encodeCall(IForwarder.forward, (forwardingEVMScript)));
        return self;
    }

    function forwardCalls(
        ProposalCallsBuilder memory self,
        string memory title,
        address forwarder,
        ForwardedCall[] memory forwardedCalls
    ) internal pure returns (ProposalCallsBuilder memory) {
        CallsScriptBuilder memory forwardingEVMScriptBuilder = CallsScriptBuilderUtils.create();

        for (uint256 i = 0; i < forwardedCalls.length; ++i) {
            ForwardedCall memory forwardedCall = forwardedCalls[i];
            title = string(abi.encodePacked(title, "\n", forwardedCall.title));
            forwardingEVMScriptBuilder.addCall(forwardedCall.target, forwardedCall.payload);
        }

        _addCallWithValue(
            self, title, forwarder, 0, abi.encodeCall(IForwarder.forward, (forwardingEVMScriptBuilder.getResult()))
        );
        return self;
    }

    function forwardCalls(
        ProposalCallsBuilder memory self,
        string memory title,
        address forwarder,
        ForwardedCallsBuilder memory forwardedCallsBuilder
    ) internal pure returns (ProposalCallsBuilder memory) {
        return forwardCalls(self, title, forwarder, ForwardedCallsBuilderUtils.getCalls(forwardedCallsBuilder));
    }

    // ---
    // Private Methods
    // ---

    function _addCallWithValue(
        ProposalCallsBuilder memory self,
        string memory title,
        address target,
        uint256 value,
        bytes memory payload
    ) private pure {
        self._calls[self._addedCallsCount] =
            ProposalCall(string(abi.encodePacked("  ", title)), target, uint96(value), payload);
        self._addedCallsCount += 1;
    }

    function _getCalls(ProposalCallsBuilder memory self) private pure returns (ProposalCall[] memory) {
        if (self._calls.length != self._addedCallsCount) {
            revert InvalidCallsCount(self._calls.length);
        }
        return self._calls;
    }
}
