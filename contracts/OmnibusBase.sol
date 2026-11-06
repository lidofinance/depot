// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IVoting} from "./interfaces/IVoting.sol";
import {VoteCall} from "./libraries/CallsBuilder.sol";
import {CallsScriptBuilder, CallsScriptBuilderUtils} from "./libraries/CallsScriptBuilder.sol";

/// @title OmnibusBase
/// @notice Abstract base contract for creating votes for the Aragon Voting.
///
/// @dev Inheriting contracts must implement:
///     - getOmnibusCalls() - the vote calls; their EVM script is what the vote executes
abstract contract OmnibusBase {
    using CallsScriptBuilderUtils for CallsScriptBuilder;

    address private immutable _VOTING;

    constructor(address voting) {
        _VOTING = voting;
    }

    /// @return The vote calls, in vote item order.
    function getOmnibusCalls() public view virtual returns (VoteCall[] memory);

    /// @notice Converts all vote items to the Aragon-compatible EVMCallScript to validate against.
    /// @return script A bytes containing encoded EVMCallScript.
    function getEVMScript() public view returns (bytes memory) {
        CallsScriptBuilder memory scriptBuilder = CallsScriptBuilderUtils.create();
        VoteCall[] memory omnibusCalls = getOmnibusCalls();

        uint256 omnibusCallsCount = omnibusCalls.length;
        for (uint256 i = 0; i < omnibusCallsCount; i++) {
            scriptBuilder.addCall(omnibusCalls[i].target, omnibusCalls[i].payload);
        }

        return scriptBuilder.getResult();
    }

    /// @notice Validates the specific vote on Aragon Voting contract against the vote items.
    /// @return A boolean value indicating whether the vote is valid.
    function isValidVoteScript(uint256 voteId) external view returns (bool) {
        (

            /*open*/
            , /*executed*/
            , /*startDate*/
            , /*snapshotBlock*/
            , /*supportRequired*/
            , /*minAcceptQuorum*/
            , /*yea*/
            , /*nay*/
            , /*votingPower*/
            ,
            bytes memory script,
            /*phase*/
        ) = IVoting(_VOTING).getVote(voteId);
        return keccak256(script) == keccak256(getEVMScript());
    }
}
