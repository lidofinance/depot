// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;


/// @notice Represents an external call to a specific address with an optional ETH transfer.
/// @param target The address to call.
/// @param value The amount of ETH (in wei) to transfer with the call, capped at approximately 7.9 billion ETH.
/// @param payload The calldata payload sent to the target address.
struct ExternalCall {
    address target;
    uint96 value;
    bytes payload;
}


/// @notice Describes the lifecycle state of a proposal, defining its current status.
/// @param NotExist Proposal has not been submitted yet.
/// @param Submitted Proposal has been successfully submitted but not scheduled yet. This state is
///     only reachable from NotExist.
/// @param Scheduled Proposal has been successfully scheduled after submission. This state is only
///     reachable from Submitted.
/// @param Executed Proposal has been successfully executed after being scheduled. This state is
///     only reachable from Scheduled and is the final state of the proposal.
/// @param Cancelled Proposal was cancelled before execution. Cancelled proposals cannot be scheduled
///     or executed. This state is only reachable from Submitted or Scheduled and is the final state
///     of the proposal.
///     @dev A proposal is considered cancelled if it was not executed and its id is less than
///         the id of the last submitted proposal at the time the `cancelAll()` method was called.
///         To check if a proposal is in the `Cancelled` state, use the `_isProposalCancelled()`
///         view function.
enum ProposalStatus {
    NotExist,
    Submitted,
    Scheduled,
    Executed,
    Cancelled
}

struct ProposalDetails {
    uint256 id;
    address executor;
    uint40 submittedAt;
    uint40 scheduledAt;
    ProposalStatus status;
}

interface ITimelock {
    function submit(address executor, ExternalCall[] calldata calls) external returns (uint256 newProposalId);
    function schedule(uint256 proposalId) external;
    function execute(uint256 proposalId) external;
    function cancelAllNonExecutedProposals() external;

    function canSchedule(uint256 proposalId) external view returns (bool);
    function canExecute(uint256 proposalId) external view returns (bool);

    function getAdminExecutor() external view returns (address);
    function setAdminExecutor(address newAdminExecutor) external;
    function getGovernance() external view returns (address);
    function setGovernance(address newGovernance) external;

    function getProposal(uint256 proposalId)
        external
        view
        returns (ProposalDetails memory proposalDetails, ExternalCall[] memory calls);
    function getProposalDetails(uint256 proposalId) external view returns (ProposalDetails memory proposalDetails);
    function getProposalCalls(uint256 proposalId) external view returns (ExternalCall[] memory calls);
    function getProposalsCount() external view returns (uint256 count);

    function getAfterSubmitDelay() external view returns (uint32);
    function getAfterScheduleDelay() external view returns (uint32);
    function setAfterSubmitDelay(uint32 newAfterSubmitDelay) external;
    function setAfterScheduleDelay(uint32 newAfterScheduleDelay) external;
    function transferExecutorOwnership(address executor, address owner) external;
}
