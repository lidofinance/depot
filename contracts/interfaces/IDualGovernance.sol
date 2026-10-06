// SPDX-FileCopyrightText: 2024 Lido <info@lido.fi>
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IDualGovernanceConfigProvider} from "./IDualGovernanceConfigProvider.sol";
import {IGovernance} from "./IGovernance.sol";

interface IResealManager {
    function resume(address sealable) external;
    function reseal(address sealable) external;
}

interface IDualGovernance is IGovernance {
    struct TiebreakerDetails {
        bool isTie;
        address tiebreakerCommittee;
        uint32 tiebreakerActivationTimeout;
        address[] sealableWithdrawalBlockers;
    }

    /// @notice The info about the registered proposer and associated executor.
    /// @param account Address of the proposer.
    /// @param executor The address of the executor assigned to execute proposals submitted by the proposer.
    struct Proposer {
        address account;
        address executor;
    }

    /// @notice Enum describing the state of the Dual Governance State Machine
    /// @param NotInitialized The initial (uninitialized) state of the Dual Governance State Machine. The state machine cannot
    ///     operate in this state and must be initialized before use.
    /// @param Normal The default state where the system is expected to remain most of the time. In this state, proposals
    ///     can be both submitted and scheduled for execution.
    /// @param VetoSignalling Represents active opposition to DAO decisions. In this state, the scheduling of proposals
    ///     is blocked, but the submission of new proposals is still allowed.
    /// @param VetoSignallingDeactivation A sub-state of VetoSignalling, allowing users to observe the deactivation process
    ///     and react before non-cancelled proposals are scheduled for execution. Both proposal submission and scheduling
    ///     are prohibited in this state.
    /// @param VetoCooldown A state where the DAO can execute non-cancelled proposals but is prohibited from submitting
    ///     new proposals.
    /// @param RageQuit Represents the process where users opting to leave the protocol can withdraw their funds. This state
    ///     is triggered when the Second Seal Threshold is reached. During this state, the scheduling of proposals for
    ///     execution is forbidden, but new proposals can still be submitted.
    enum State {
        NotInitialized,
        Normal,
        VetoSignalling,
        VetoSignallingDeactivation,
        VetoCooldown,
        RageQuit
    }

    struct StateDetails {
        State effectiveState;
        State persistedState;
        uint40 persistedStateEnteredAt;
        uint40 vetoSignallingActivatedAt;
        uint40 vetoSignallingReactivationTime;
        uint40 normalOrVetoCooldownExitedAt;
        uint256 rageQuitRound;
        uint40 vetoSignallingDuration;
    }

    function MIN_TIEBREAKER_ACTIVATION_TIMEOUT() external view returns (uint40);
    function MAX_TIEBREAKER_ACTIVATION_TIMEOUT() external view returns (uint40);
    function MAX_SEALABLE_WITHDRAWAL_BLOCKERS_COUNT() external view returns (uint256);

    function canSubmitProposal() external view returns (bool);
    function canCancelAllPendingProposals() external view returns (bool);
    function activateNextState() external;
    function setConfigProvider(address newConfigProvider) external;
    function getConfigProvider() external view returns (address);
    function getVetoSignallingEscrow() external view returns (address);
    function getRageQuitEscrow() external view returns (address);
    function getPersistedState() external view returns (State persistedState);
    function getEffectiveState() external view returns (State effectiveState);
    function getStateDetails() external view returns (StateDetails memory stateDetails);

    function registerProposer(address proposerAccount, address executor) external;
    function setProposerExecutor(address proposerAccount, address newExecutor) external;
    function unregisterProposer(address proposerAccount) external;
    function isProposer(address proposerAccount) external view returns (bool);
    function getProposer(address proposerAccount) external view returns (Proposer memory proposer);
    function getProposers() external view returns (Proposer[] memory proposers);
    function isExecutor(address executor) external view returns (bool);

    function resealSealable(address sealable) external;
    function setResealCommittee(address newResealCommittee) external;
    function setResealManager(address newResealManager) external;
    function getResealManager() external view returns (address);
    function getResealCommittee() external view returns (address);

    function setProposalsCanceller(address newProposalsCanceller) external;
    function getProposalsCanceller() external view returns (address);

    function addTiebreakerSealableWithdrawalBlocker(address sealableWithdrawalBlocker) external;
    function removeTiebreakerSealableWithdrawalBlocker(address sealableWithdrawalBlocker) external;
    function setTiebreakerCommittee(address newTiebreakerCommittee) external;
    function setTiebreakerActivationTimeout(uint32 newTiebreakerActivationTimeout) external;
    function tiebreakerScheduleProposal(uint256 proposalId) external;
    function getTiebreakerDetails() external view returns (TiebreakerDetails memory tiebreakerState);
    function tiebreakerResumeSealable(address sealable) external;
}
