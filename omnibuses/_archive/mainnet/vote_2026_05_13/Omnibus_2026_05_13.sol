// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {MainnetAddresses as Addresses} from "contracts/addresses/MainnetAddresses.sol";
import {
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils,
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils
} from "contracts/libraries/calls-builder.sol";
import {AclPermissionsUtils} from "contracts/libraries/AclPermissions.sol";

import {IACL} from "contracts/interfaces/IACL.sol";
import {IAccessControl} from "contracts/interfaces/IAccessControl.sol";
import {IAllowedRecipientsRegistry} from "contracts/interfaces/IAllowedRecipientsRegistry.sol";
import {IEmergencyProtectedTimelock} from "contracts/interfaces/IEmergencyProtectedTimelock.sol";
import {IHashConsensus} from "contracts/interfaces/IHashConsensus.sol";
import {ITimeConstraints} from "contracts/interfaces/ITimeConstraints.sol";

/// @title Omnibus_2026_05_13
/// @notice Vote #201: Dual Governance Emergency Protection extension, MANAGE_SIGNING_KEYS for Consensys,
///     Alliance Ops stablecoins Easy Track limit increase and the VEBO reporting frame reduction.
///
///     1. Submit a Dual Governance proposal
///        I. Extend Dual Governance Emergency Protection for one additional year
///        1.1. Call setEmergencyProtectionEndDate(1813449600) on Emergency Protected Timelock
///        II. Grant MANAGE_SIGNING_KEYS role to Consensys
///        1.2. Grant MANAGE_SIGNING_KEYS role to 0xF45C77EadD434612fCD93db978B3E36B0D58eC99 for Node Operator Consensys (ID = 21)
///        III. Increase limit from $250K per 3 months to $5M per 6 months on Alliance Ops stablecoins Easy Track factory
///        1.3. Set limit to 5,000,000 USD per 6 months on Alliance Ops stablecoins AllowedRecipientsRegistry
///        IV. Change number of epochs in VEBO reporting frame
///        1.4. Grant MANAGE_FRAME_CONFIG_ROLE role to Aragon Agent on the VEBO Hash Consensus
///        1.5. Set number of epochs in reporting frame to 45 on the VEBO Hash Consensus, keeping fastLaneLengthSlots = 100
///        1.6. Revoke MANAGE_FRAME_CONFIG_ROLE role from Aragon Agent on the VEBO Hash Consensus
///        1.7. Set time window constraint (13:00 - 16:30 UTC) for Dual Governance Proposal execution on Dual Governance Time Constraints
contract Omnibus_2026_05_13 is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using ProposalCallsBuilderUtils for ProposalCallsBuilder;

    // ---
    // Dual Governance Emergency Protection
    // ---

    uint40 public constant NEW_EMERGENCY_PROTECTION_END_DATE = 1813449600;

    // ---
    // MANAGE_SIGNING_KEYS for Consensys
    // ---

    bytes32 public constant MANAGE_SIGNING_KEYS = 0x75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee;
    uint256 public constant CONSENSYS_NODE_OPERATOR_ID = 21;
    address public constant CONSENSYS_SIGNING_KEYS_MANAGER = 0xF45C77EadD434612fCD93db978B3E36B0D58eC99;

    // ---
    // Alliance Ops stablecoins Easy Track factory
    // ---

    address public constant ALLIANCE_OPS_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY =
        0x3B525F4c059F246Ca4aa995D21087204F30c9E2F;
    uint256 public constant ALLIANCE_OPS_NEW_LIMIT = 5_000_000 * 10 ** 18;
    uint256 public constant ALLIANCE_OPS_NEW_PERIOD_DURATION_MONTHS = 6;

    // ---
    // VEBO reporting frame
    // ---

    address public constant VEBO_HASH_CONSENSUS = 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a;
    bytes32 public constant MANAGE_FRAME_CONFIG_ROLE =
        0x921f40f434e049d23969cbe68d9cf3ac1013fbe8945da07963af6f3142de6afe;
    uint256 public constant VEBO_NEW_EPOCHS_PER_FRAME = 45;
    /// @dev Kept as on-chain per the description; the test asserts it against the Hash Consensus before the vote.
    uint256 public constant VEBO_FAST_LANE_LENGTH_SLOTS = 100;

    // ---
    // Dual Governance proposal execution window
    // ---

    address public constant DUAL_GOVERNANCE_TIME_CONSTRAINTS = 0x2a30F5aC03187674553024296bed35Aa49749DDa;
    uint32 public constant EXECUTION_WINDOW_START_DAY_TIME = 13 hours;
    uint32 public constant EXECUTION_WINDOW_END_DAY_TIME = 16 hours + 30 minutes;

    // ---
    // Vote
    // ---

    string internal constant DG_PROPOSAL_METADATA =
        "Extend Dual Governance Emergency Protection until June 20 2027, grant MANAGE_SIGNING_KEYS role to Node Operator Consensys, increase Alliance Ops stablecoins Easy Track factory limit from $250K per 3 months to $5M per 6 months, reduce VEBO Reporting Frame from 75 to 45 epochs";

    uint256 public constant VOTE_ITEMS_COUNT = 1;
    uint256 public constant DG_PROPOSAL_CALLS_COUNT = 7;

    constructor() OmnibusBase(Addresses.VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create({
            callsCount: VOTE_ITEMS_COUNT
        }).submitCalls(
                "Submit a Dual Governance proposal to extend Dual Governance Emergency Protection until June 20 2027, grant MANAGE_SIGNING_KEYS role to Node Operator Consensys, increase Alliance Ops stablecoins Easy Track factory limit from $250K per 3 months to $5M per 6 months, reduce VEBO Reporting Frame from 75 to 45 epochs",
                DG_PROPOSAL_METADATA,
                Addresses.DUAL_GOVERNANCE,
                ProposalCallsBuilderUtils.create({
                    callsCount: DG_PROPOSAL_CALLS_COUNT
                }).directCall(
                        "Call setEmergencyProtectionEndDate(1813449600) on Emergency Protected Timelock 0xCE0425301C85c5Ea2A0873A2dEe44d78E02D2316",
                        Addresses.TIMELOCK,
                        abi.encodeCall(
                            IEmergencyProtectedTimelock.setEmergencyProtectionEndDate,
                            (NEW_EMERGENCY_PROTECTION_END_DATE)
                        )
                    )
                    .forwardCall(
                        "Grant MANAGE_SIGNING_KEYS 75abc64490e17b40ea1e66691c3eb493647b24430b358bd87ec3e5127f1621ee role to 0xF45C77EadD434612fCD93db978B3E36B0D58eC99 for Node Operator Consensys (ID = 21)",
                        Addresses.AGENT,
                        Addresses.ACL,
                        abi.encodeCall(
                            IACL.grantPermissionP,
                            (
                                CONSENSYS_SIGNING_KEYS_MANAGER,
                                Addresses.NODE_OPERATORS_REGISTRY,
                                MANAGE_SIGNING_KEYS,
                                _manageSigningKeysParams()
                            )
                        )
                    )
                    .forwardCall(
                        "Set limit to 5,000,000 USD per 6 months on Alliance Ops stablecoins AllowedRecipientsRegistry 0x3B525F4c059F246Ca4aa995D21087204F30c9E2F",
                        Addresses.AGENT,
                        ALLIANCE_OPS_STABLECOINS_ALLOWED_RECIPIENTS_REGISTRY,
                        abi.encodeCall(
                            IAllowedRecipientsRegistry.setLimitParameters,
                            (ALLIANCE_OPS_NEW_LIMIT, ALLIANCE_OPS_NEW_PERIOD_DURATION_MONTHS)
                        )
                    )
                    .forwardCall(
                        "Grant MANAGE_FRAME_CONFIG_ROLE 0x921f40f434e049d23969cbe68d9cf3ac1013fbe8945da07963af6f3142de6afe role to Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c on the VEBO Hash Consensus 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a",
                        Addresses.AGENT,
                        VEBO_HASH_CONSENSUS,
                        abi.encodeCall(IAccessControl.grantRole, (MANAGE_FRAME_CONFIG_ROLE, Addresses.AGENT))
                    )
                    .forwardCall(
                        "Set number of epochs in reporting frame to 45 on the VEBO Hash Consensus 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a",
                        Addresses.AGENT,
                        VEBO_HASH_CONSENSUS,
                        abi.encodeCall(
                            IHashConsensus.setFrameConfig, (VEBO_NEW_EPOCHS_PER_FRAME, VEBO_FAST_LANE_LENGTH_SLOTS)
                        )
                    )
                    .forwardCall(
                        "Revoke MANAGE_FRAME_CONFIG_ROLE 0x921f40f434e049d23969cbe68d9cf3ac1013fbe8945da07963af6f3142de6afe role from Aragon Agent 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c on the VEBO Hash Consensus 0x7FaDB6358950c5fAA66Cb5EB8eE5147De3df355a",
                        Addresses.AGENT,
                        VEBO_HASH_CONSENSUS,
                        abi.encodeCall(IAccessControl.revokeRole, (MANAGE_FRAME_CONFIG_ROLE, Addresses.AGENT))
                    )
                    .directCall(
                        "Set time window constraint (13:00 - 16:30 UTC) for Dual Governance Proposal execution on Dual Governance Time Constraints 0x2a30F5aC03187674553024296bed35Aa49749DDa",
                        DUAL_GOVERNANCE_TIME_CONSTRAINTS,
                        abi.encodeCall(
                            ITimeConstraints.checkTimeWithinDayTimeAndEmit,
                            (EXECUTION_WINDOW_START_DAY_TIME, EXECUTION_WINDOW_END_DAY_TIME)
                        )
                    )
            ).getCalls();
    }

    /// @dev The permission holds only when the first argument of the guarded call is the Consensys operator id.
    function _manageSigningKeysParams() private pure returns (uint256[] memory params) {
        params = new uint256[](1);
        params[0] = AclPermissionsUtils.param(0, AclPermissionsUtils.Op.EQ, uint240(CONSENSYS_NODE_OPERATOR_ID));
    }
}
