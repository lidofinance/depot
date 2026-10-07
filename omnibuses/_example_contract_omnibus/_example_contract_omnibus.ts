import { assert } from "chai";
import { decodeFunctionData } from "viem";
import { event, expectedEvents as ev, Omnibus } from "../../src/omnibuses";
import { decodeSubmitProposal } from "../../src/omnibuses/vote-events";
import { createContracts, OmnibusBaseContract } from "../../src/contracts";
import { Agent_ABI } from "../../abi/Agent.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";
import { Finance_ABI } from "../../abi/Finance.abi";
import { EasyTrack_ABI } from "../../abi/EasyTrack.abi";
import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { StakingRouter_ABI } from "../../abi/StakingRouter.abi";
import { StETH_ABI } from "../../abi/StETH.abi";
import { ExampleContractOmnibusVoteStateValidatorContract } from "./_example_contract_omnibus.abi";

const LDO = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32";
const AGENT = "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c";
const FINANCE = "0xB9E5CBB9CA5b0d659238807E84D0176930753d86";
const EASY_TRACK = "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea";
const CURATED_MODULE = "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5";
const STAKING_ROUTER = "0xFdDf38947aFB03C621C71b06C9C70bce73f12999";
const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
const A41_REWARD_ADDRESS = "0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7";
const DEVELP_REWARD_ADDRESS = "0x0a6a0b60fFeF196113b3530781df6e747DdC565e";
const EBUNKER_REWARD_ADDRESS = "0x2A2245d1f47430b9f60adCFC63D158021E80A728";
const GATEWAY_REWARD_ADDRESS = "0x78CEE97C23560279909c0215e084dB293F036774";
const NUMIC_REWARD_ADDRESS = "0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC";
const PARAFI_REWARD_ADDRESS = "0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7";
const ROCKAWAY_REWARD_ADDRESS = "0xcA6817DAb36850D58375A10c78703CE49d41D25a";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const ATC_STABLES_MULTISIG = "0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956";
const ATC_STABLES_LDO_TRANSFER_AMOUNT = 110_000n * 10n ** 18n;

const PML_MULTISIG = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
const PML_LDO_TRANSFER_AMOUNT = 180_000n * 10n ** 18n;
const EXPECTED_TOTAL_LDO_TRANSFER_AMOUNT = ATC_STABLES_LDO_TRANSFER_AMOUNT + PML_LDO_TRANSFER_AMOUNT;

const DEPOSIT_PAUSED_STATUS = 1;
const CURATED_STAKING_MODULE_ID = 1n;

const STETH_SUBMIT_AMOUNT = 100n; // 100 wei

const NEW_NODE_OPERATORS = [
  { rewardAddress: A41_REWARD_ADDRESS, name: "A41" },
  { rewardAddress: DEVELP_REWARD_ADDRESS, name: "Develp GmbH" },
  { rewardAddress: EBUNKER_REWARD_ADDRESS, name: "Ebunker" },
  { rewardAddress: GATEWAY_REWARD_ADDRESS, name: "Gateway.fm AS" },
  { rewardAddress: NUMIC_REWARD_ADDRESS, name: "Numic" },
  { rewardAddress: PARAFI_REWARD_ADDRESS, name: "ParaFi Technologies LLC" },
  { rewardAddress: ROCKAWAY_REWARD_ADDRESS, name: "RockawayX Infra" },
] as const;

const REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY = "0x85d703B2A4BaD713b596c647badac9A1e95bB03d";
const REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY = "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C";
const REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY = "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E";
const REWARDS_STETH_TRUSTED_CALLER = "0x87D93d9B2C672bf9c9642d853a8682546a5012B5";
const REWARDS_STETH_REGISTRY = "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A";

const REWARDS_LDO_TOP_UP_FACTORY = "0x200dA0b6a9905A377CF8D469664C65dB267009d1";
const REWARDS_LDO_ADD_RECIPIENT_FACTORY = "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252";
const REWARDS_LDO_REMOVE_RECIPIENT_FACTORY = "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7";

const SDVT_MODULE_ID = 2;

const contracts = createContracts({
  ldo: [MiniMeToken_ABI, LDO],
  agent: [Agent_ABI, AGENT],
  finance: [Finance_ABI, FINANCE],
  easyTrack: [EasyTrack_ABI, EASY_TRACK],
  curatedStakingModule: [NodeOperatorsRegistry_ABI, CURATED_MODULE],
  stakingRouter: [StakingRouter_ABI, STAKING_ROUTER],
  stETH: [StETH_ABI, STETH],
});

export default Omnibus.create({
  network: "mainnet",

  voteId: undefined, // Vote ID should be set only if omnibus is already started.
  launchedAt: undefined, // Launch block number should be set only if omnibus was successfully launched.
  executedAt: undefined, // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: undefined, // Should be set to true if quorum was reached during the vote.

  async deploy({ deployContract }) {
    const voteStateValidator = await deployContract<ExampleContractOmnibusVoteStateValidatorContract>(
      "ExampleContractOmnibusVoteStateValidator",
      [contracts.ldo.address, contracts.agent.address, EXPECTED_TOTAL_LDO_TRANSFER_AMOUNT],
    );
    return {
      voteStateValidator,
      omnibus: await deployContract<OmnibusBaseContract>("ExampleContractOmnibus", [voteStateValidator.address]),
    };
  },

  testVote: async ({ client, checks, passOmnibus, deployment }) => {
    const { ldo, agent } = contracts;

    await checks.stakingRouter.checkStakingModuleFee(contracts, {
      stakingModuleId: SDVT_MODULE_ID,
      treasuryFee: 2_00,
      stakingModuleFee: 8_00,
    });

    const [agentLdoBalanceBefore, atcLdoBalanceBefore, pmlLdoBalanceBefore] = await Promise.all([
      client.read(ldo, "balanceOf", [agent.address]),
      client.read(ldo, "balanceOf", [ATC_STABLES_MULTISIG]),
      client.read(ldo, "balanceOf", [PML_MULTISIG]),
    ]);
    const beforeValidatedBefore = await client.read(deployment.voteStateValidator, "beforeValidated", []);
    const afterValidatedBefore = await client.read(deployment.voteStateValidator, "afterValidated", []);

    const { submittedProposalIds, voteEvents } = await passOmnibus();

    voteEvents.item("Capture LDO balance before vote execution", [
      event(deployment.voteStateValidator, "StateValidatedBefore", [agentLdoBalanceBefore]),
    ]);
    voteEvents.item(
      `Add TopUpEVMScriptFactory with address ${REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY}`,
      ev.easyTrack.topUpFactoryAdded(contracts.easyTrack, {
        factory: REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY,
        finance: contracts.finance.address,
        registry: REWARDS_STETH_REGISTRY,
      }),
    );
    voteEvents.item(
      `Add AddRecipientEVMScriptFactory with address ${REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY}`,
      ev.easyTrack.addRecipientFactoryAdded(contracts.easyTrack, {
        factory: REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY,
        registry: REWARDS_STETH_REGISTRY,
      }),
    );
    voteEvents.item(
      `Add RemoveRecipientEVMScriptFactory with address ${REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY}`,
      ev.easyTrack.removeRecipientFactoryAdded(contracts.easyTrack, {
        factory: REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY,
        registry: REWARDS_STETH_REGISTRY,
      }),
    );
    voteEvents.item(
      "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
      ev.finance.tokenPaid(
        { finance: contracts.finance, vault: agent, token: ldo },
        {
          recipient: ATC_STABLES_MULTISIG,
          amount: ATC_STABLES_LDO_TRANSFER_AMOUNT,
          reference: "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
        },
      ),
    );
    voteEvents.item(
      `Remove TopUpEVMScriptFactory with address ${REWARDS_LDO_TOP_UP_FACTORY}`,
      ev.easyTrack.factoryRemoved(contracts.easyTrack, { factory: REWARDS_LDO_TOP_UP_FACTORY }),
    );
    voteEvents.item(
      `Remove AddRecipientEVMScriptFactory with address ${REWARDS_LDO_ADD_RECIPIENT_FACTORY}`,
      ev.easyTrack.factoryRemoved(contracts.easyTrack, { factory: REWARDS_LDO_ADD_RECIPIENT_FACTORY }),
    );
    voteEvents.item(
      `Remove RemoveRecipientEVMScriptFactory with address ${REWARDS_LDO_REMOVE_RECIPIENT_FACTORY}`,
      ev.easyTrack.factoryRemoved(contracts.easyTrack, { factory: REWARDS_LDO_REMOVE_RECIPIENT_FACTORY }),
    );
    voteEvents.item(
      "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      ev.finance.tokenPaid(
        { finance: contracts.finance, vault: agent, token: ldo },
        {
          recipient: PML_MULTISIG,
          amount: PML_LDO_TRANSFER_AMOUNT,
          reference: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
        },
      ),
    );
    voteEvents.item("Validate LDO balance after vote execution", [
      event(deployment.voteStateValidator, "StateValidatedAfter", [
        agentLdoBalanceBefore - EXPECTED_TOTAL_LDO_TRANSFER_AMOUNT,
        EXPECTED_TOTAL_LDO_TRANSFER_AMOUNT,
      ]),
    ]);
    voteEvents.item("Submit proposal to Dual Governance with the following calls:");

    assert.equal(submittedProposalIds.length, 1);
    const beforeValidatedAfter = await client.read(deployment.voteStateValidator, "beforeValidated", []);
    const afterValidatedAfter = await client.read(deployment.voteStateValidator, "afterValidated", []);
    const spent = await client.read(deployment.voteStateValidator, "spent", []);

    assert.equal(beforeValidatedBefore, false);
    assert.equal(afterValidatedBefore, false);
    assert.equal(beforeValidatedAfter, true);
    assert.equal(afterValidatedAfter, true);
    assert.equal(spent, EXPECTED_TOTAL_LDO_TRANSFER_AMOUNT);

    await Promise.all([
      checks.tokens.checkERC20Balance({
        token: contracts.ldo.address,
        account: ATC_STABLES_MULTISIG,
        expectedBalance: atcLdoBalanceBefore + ATC_STABLES_LDO_TRANSFER_AMOUNT,
      }),
      checks.tokens.checkERC20Balance({
        token: contracts.ldo.address,
        account: PML_MULTISIG,
        expectedBalance: pmlLdoBalanceBefore + PML_LDO_TRANSFER_AMOUNT,
      }),
      checks.tokens.checkERC20Balance({
        token: contracts.ldo.address,
        account: agent.address,
        expectedBalance: agentLdoBalanceBefore - ATC_STABLES_LDO_TRANSFER_AMOUNT - PML_LDO_TRANSFER_AMOUNT,
      }),
    ]);

    await checks.easyTrack.checkFactoryExists(contracts, REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY);
    await checks.easyTrack.checkTopUpFactory({
      contracts,
      token: ldo.address,
      registry: REWARDS_STETH_REGISTRY,
      factory: REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY,
      trustedCaller: REWARDS_STETH_TRUSTED_CALLER,
      epsilon: 2,
    });

    await checks.easyTrack.checkFactoryExists(contracts, REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY);
    await checks.easyTrack.checkAddRecipientFactory(
      contracts,
      REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY,
      REWARDS_STETH_REGISTRY,
      REWARDS_STETH_TRUSTED_CALLER,
    );

    await checks.easyTrack.checkFactoryExists(contracts, REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY);
    await checks.easyTrack.checkRemoveRecipientFactory(
      contracts,
      REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY,
      REWARDS_STETH_REGISTRY,
      REWARDS_STETH_TRUSTED_CALLER,
    );

    await checks.easyTrack.checkFactoryNotExists(contracts, REWARDS_LDO_TOP_UP_FACTORY);
    await checks.easyTrack.checkFactoryNotExists(contracts, REWARDS_LDO_ADD_RECIPIENT_FACTORY);
    await checks.easyTrack.checkFactoryNotExists(contracts, REWARDS_LDO_REMOVE_RECIPIENT_FACTORY);
  },

  testProposal: async ({ client, checks, passProposals, deployment }) => {
    const nodeOperatorsCountBefore = await client.read(contracts.curatedStakingModule, "getNodeOperatorsCount", []);
    const voteCalls = await client.read(deployment.omnibus, "getOmnibusCalls", []);
    const executeCall = decodeFunctionData({
      abi: Agent_ABI,
      data: decodeSubmitProposal(voteCalls[10]).calls[1].payload,
    });
    if (executeCall.functionName !== "execute") {
      throw new Error("The second proposal call must execute the stETH deposit through Agent");
    }
    const [, , depositPayload] = executeCall.args;

    const { proposalEvents } = await passProposals();
    const [proposal] = proposalEvents;
    proposal.call(0, [
      event(contracts.stakingRouter, "StakingModuleStatusSet", [
        CURATED_STAKING_MODULE_ID,
        DEPOSIT_PAUSED_STATUS,
        contracts.agent.address,
      ]),
    ]);
    proposal.call(1, [
      event(contracts.stETH, "Submitted", [contracts.agent.address, STETH_SUBMIT_AMOUNT, null]),
      event(contracts.stETH, "Transfer", [
        ZERO_ADDRESS,
        contracts.agent.address,
        (value) => assert.approximately(value, STETH_SUBMIT_AMOUNT, 1n),
      ]),
      event(contracts.stETH, "TransferShares", [ZERO_ADDRESS, contracts.agent.address, null]),
      event(contracts.agent, "Execute", [null, contracts.stETH.address, STETH_SUBMIT_AMOUNT, depositPayload]),
    ]);
    proposal.call(
      2,
      NEW_NODE_OPERATORS.map((operator, index) => [
        event(contracts.curatedStakingModule, "NodeOperatorAdded", [
          nodeOperatorsCountBefore + BigInt(index),
          operator.name,
          operator.rewardAddress,
          0n,
        ]),
      ]),
    );

    await checks.stakingRouter.checkStakingModuleFee(contracts, {
      stakingModuleId: SDVT_MODULE_ID,
      treasuryFee: 2_00,
      stakingModuleFee: 8_00,
    });

    await checks.stakingRouter.checkNodeOperatorsCount({
      stakingModule: contracts.curatedStakingModule,
      nodeOperatorsCount: nodeOperatorsCountBefore + BigInt(NEW_NODE_OPERATORS.length),
    });

    for (let i = 0; i < NEW_NODE_OPERATORS.length; i++) {
      const operator = NEW_NODE_OPERATORS[i];
      const operatorIndex = nodeOperatorsCountBefore + BigInt(i);

      await checks.stakingRouter.checkNodeOperator({
        stakingModule: contracts.curatedStakingModule,
        operatorId: operatorIndex,
        name: operator.name,
        rewardAddress: operator.rewardAddress,
      });
    }
  },
});
