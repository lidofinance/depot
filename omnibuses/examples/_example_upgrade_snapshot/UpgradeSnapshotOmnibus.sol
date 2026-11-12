// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {OmnibusBase} from "contracts/OmnibusBase.sol";
import {IOssifiableProxy} from "contracts/interfaces/IOssifiableProxy.sol";
import {AgentCalls} from "contracts/libraries/Agent.sol";
import {DualGovernanceCalls} from "contracts/libraries/DualGovernance.sol";
import {
    VoteCall,
    VoteCallsBuilder,
    VoteCallsBuilderUtils,
    ProposalCallsBuilder,
    ProposalCallsBuilderUtils
} from "contracts/libraries/CallsBuilder.sol";

contract UpgradeSnapshotOmnibus is OmnibusBase {
    using VoteCallsBuilderUtils for VoteCallsBuilder;
    using DualGovernanceCalls for VoteCallsBuilder;
    using AgentCalls for ProposalCallsBuilder;

    address public constant VOTING = 0x2e59A20f205bB85a89C53f1936454680651E618e;
    address public constant DUAL_GOVERNANCE = 0xC1db28B3301331277e307FDCfF8DE28242A4486E;
    address public constant AGENT = 0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c;
    address public constant LOCATOR = 0xC1d0b3DE6792Bf6b4b37EccdcC24e45978Cfd2Eb;
    address public constant IMPLEMENTATION = 0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313;
    string public constant ITEM_TITLE = "Submit the Locator upgrade snapshot example";
    string internal constant PROPOSAL_METADATA =
        "Upgrade Lido Locator to 0xF2Ffb952e129a63F0614Ff87126E1d4a494A2313 for a local upgrade snapshot rehearsal.";

    constructor() OmnibusBase(VOTING) {}

    function getOmnibusCalls() public pure override returns (VoteCall[] memory) {
        return VoteCallsBuilderUtils.create(1)
            .submitProposal(
                ITEM_TITLE,
                PROPOSAL_METADATA,
                DUAL_GOVERNANCE,
                ProposalCallsBuilderUtils.create(1)
                    .forward(
                        "Upgrade the Locator implementation",
                        AGENT,
                        LOCATOR,
                        abi.encodeCall(IOssifiableProxy.proxy__upgradeTo, (IMPLEMENTATION))
                    )
            )
            .getCalls();
    }
}
