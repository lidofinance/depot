// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {IACL} from "contracts/interfaces/IACL.sol";
import {AgentCalls} from "contracts/libraries/Agent.sol";
import {DualGovernanceCalls} from "contracts/libraries/DualGovernance.sol";
import {KernelCalls} from "contracts/libraries/Kernel.sol";
import {
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils,
    ForwardedCallsBuilder,
    ForwardedCallsBuilderUtils
} from "contracts/libraries/calls-builder.sol";

/// @notice Fork-only example upgrading a fixture app through the deployed DG, Agent and Kernel.
contract AgentDgKernelOmnibus is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using DualGovernanceCalls for VoteCallsBuilder;
    using AgentCalls for ProposalCallsBuilder;
    using ForwardedCallsBuilderUtils for ForwardedCallsBuilder;
    using KernelCalls for ForwardedCallsBuilder;

    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address public constant DUAL_GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address public constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    address public constant ACL = 0x9895F0F17cc1d1891b6f18ee0b483B6f221b37Bb;
    address public constant KERNEL = 0xb8FFC3Cd6e7Cf5a098A1c92F48009765B24088Dc;
    address public constant OLD_IMPLEMENTATION = 0x0000000000000000000000000000000000000701;
    address public constant NEW_IMPLEMENTATION = 0x0000000000000000000000000000000000000702;

    bytes32 public constant APP_ID = keccak256("depot.agent-dg-kernel-example");
    bytes32 public constant APP_MANAGER_ROLE = keccak256("APP_MANAGER_ROLE");
    string public constant ITEM_TITLE = "Submit a proposal to upgrade the fixture Kernel app";
    string internal constant PROPOSAL_METADATA =
        "1. Temporarily grant APP_MANAGER_ROLE to Aragon Agent on Kernel.\n2. In one Agent forward, upgrade the fixture app to implementation V2 and revoke APP_MANAGER_ROLE.";

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create(1)
            .submitProposal(
                ITEM_TITLE,
                PROPOSAL_METADATA,
                DUAL_GOVERNANCE,
                ProposalCallsBuilderUtils.create(2)
                    .forward(
                        "Temporarily grant APP_MANAGER_ROLE",
                        AGENT,
                        ACL,
                        abi.encodeCall(IACL.grantPermission, (AGENT, KERNEL, APP_MANAGER_ROLE))
                    )
                    .forward(
                        "Upgrade the fixture app and revoke APP_MANAGER_ROLE",
                        AGENT,
                        ForwardedCallsBuilderUtils.create(2)
                            .updateAppImplementation("Upgrade fixture app", KERNEL, APP_ID, NEW_IMPLEMENTATION)
                            .directCall(
                                "Revoke APP_MANAGER_ROLE",
                                ACL,
                                abi.encodeCall(IACL.revokePermission, (AGENT, KERNEL, APP_MANAGER_ROLE))
                            )
                    )
            )
            .getCalls();
    }
}
