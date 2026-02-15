import { assert } from "chai";
import { Omnibus } from "../../src/omnibuses";
import { zeroAddress } from "viem";
import { createContracts, OmnibusBaseContract } from "../../src/contracts";
import { Agent_ABI } from "../../abi/Agent.abi";
import { MiniMeToken_ABI } from "../../abi/MiniMeToken.abi";
import { Finance_ABI } from "../../abi/Finance.abi";
import { EasyTrack_ABI } from "../../abi/EasyTrack.abi";
import { DualGovernance_ABI } from "../../abi/DualGovernance.abi";
import { NodeOperatorsRegistry_ABI } from "../../abi/NodeOperatorsRegistry.abi";
import { StakingRouter_ABI } from "../../abi/StakingRouter.abi";
import { StETH_ABI } from "../../abi/StETH.abi";

const ATC_STABLES_MULTISIG = "0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956";
const ATC_STABLES_LDO_TRANSFER_AMOUNT = 110_000n * 10n ** 18n;

const PML_MULTISIG = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
const PML_LDO_TRANSFER_AMOUNT = 180_000n * 10n ** 18n;

const DEPOSIT_PAUSED_STATUS = 1;
const CURATED_STAKING_MODULE_ID = 1n;

const STETH_SUBMIT_AMOUNT = 100n; // 100 wei

const NEW_NODE_OPERATORS = [
  { rewardAddress: "0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7", name: "A41" },
  { rewardAddress: "0x0a6a0b60fFeF196113b3530781df6e747DdC565e", name: "Develp GmbH" },
  { rewardAddress: "0x2A2245d1f47430b9f60adCFC63D158021E80A728", name: "Ebunker" },
  { rewardAddress: "0x78CEE97C23560279909c0215e084dB293F036774", name: "Gateway.fm AS" },
  { rewardAddress: "0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC", name: "Numic" },
  { rewardAddress: "0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7", name: "ParaFi Technologies LLC" },
  { rewardAddress: "0xcA6817DAb36850D58375A10c78703CE49d41D25a", name: "RockawayX Infra" },
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
  ldo: [MiniMeToken_ABI, "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32"],
  agent: [Agent_ABI, "0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c"],
  finance: [Finance_ABI, "0xB9E5CBB9CA5b0d659238807E84D0176930753d86"],
  easyTrack: [EasyTrack_ABI, "0xF0211b7660680B49De1A7E9f25C65660F0a13Fea"],
  dualGovernance: [DualGovernance_ABI, "0xC1db28B3301331277e307FDCfF8DE28242A4486E"],
  curatedStakingModule: [NodeOperatorsRegistry_ABI, "0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5"],
  stakingRouter: [StakingRouter_ABI, "0xFdDf38947aFB03C621C71b06C9C70bce73f12999"],
  stETH: [StETH_ABI, "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"],
});

export default Omnibus.create({
  network: "mainnet",

  voteId: undefined, // Vote ID should be set only if omnibus is already started.
  launchedAt: undefined, // Launch block number should be set only if omnibus was successfully launched.
  executedAt: undefined, // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: undefined, // Should be set to true if quorum was reached during the vote.

  // ---
  // The main difference with the regular omnibus script, and additional information
  // about the contract will be used to provide data for the omnibus launch
  // ---

  // ---
  // After the contract deployed on the mainnet put the deployed addresses in the "deployment" section
  // to use the deployed addresses in the omnibus operations (launch, test, trace, and e.t.c)
  // ---

  // deployment: {
  //   omnibus: contract(OmnibusBase_ABI, "0x", "ExampleContractOmnibus"),
  // },

  async deploy({ deployContract }) {
    return {
      omnibus: await deployContract<OmnibusBaseContract>("ExampleContractOmnibus", []),
    };
  },

  calls: ({ blueprints, directCall, event, submitCalls, forwardCalls, executeCall, forwardCall }) => [
    blueprints.easyTrack.addTopUpEvmScriptFactory(contracts, {
      title: `1. Add TopUpEVMScriptFactory with address ${REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY}`,
      factory: REWARDS_STETH_TOP_UP_EVM_SCRIPT_FACTORY,
      registry: REWARDS_STETH_REGISTRY,
    }),

    blueprints.easyTrack.addAddRecipientEvmScriptFactory(contracts, {
      title: `2. Add AddRecipientEVMScriptFactory with address ${REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY}`,
      factory: REWARDS_STETH_ADD_RECIPIENT_EVM_SCRIPT_FACTORY,
      registry: REWARDS_STETH_REGISTRY,
    }),

    blueprints.easyTrack.addRemoveRecipientEvmScriptFactory(contracts, {
      title: `3. Add RemoveRecipientEVMScriptFactory with address ${REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY}`,
      factory: REWARDS_STETH_REMOVE_RECIPIENT_EVM_SCRIPT_FACTORY,
      registry: REWARDS_STETH_REGISTRY,
    }),

    blueprints.tokens.transfer(contracts, {
      title: "4. Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
      to: ATC_STABLES_MULTISIG,
      token: contracts.ldo.address,
      amount: ATC_STABLES_LDO_TRANSFER_AMOUNT,
      comment: "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
    }),

    blueprints.easyTrack.removeEvmScriptFactory(contracts, {
      title: `5. Remove TopUpEVMScriptFactory with address ${REWARDS_LDO_TOP_UP_FACTORY}`,
      factory: REWARDS_LDO_TOP_UP_FACTORY,
    }),

    blueprints.easyTrack.removeEvmScriptFactory(contracts, {
      title: `6. Remove AddRecipientEVMScriptFactory with address ${REWARDS_LDO_ADD_RECIPIENT_FACTORY}`,
      factory: REWARDS_LDO_ADD_RECIPIENT_FACTORY,
    }),

    blueprints.easyTrack.removeEvmScriptFactory(contracts, {
      title: `7. Remove RemoveRecipientEVMScriptFactory with address ${REWARDS_LDO_REMOVE_RECIPIENT_FACTORY}`,
      factory: REWARDS_LDO_REMOVE_RECIPIENT_FACTORY,
    }),

    directCall("8. Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig", {
      on: contracts.finance,
      fn: "newImmediatePayment",
      args: [
        contracts.ldo.address,
        PML_MULTISIG,
        PML_LDO_TRANSFER_AMOUNT,
        "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      ],
      events: [
        event(contracts.finance, "NewPeriod", [null, null, null], { isOptional: true }),
        event(contracts.finance, "NewTransaction", [
          null,
          false,
          PML_MULTISIG,
          PML_LDO_TRANSFER_AMOUNT,
          "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
        ]),
        event(contracts.ldo, "Transfer", [contracts.agent.address, PML_MULTISIG, PML_LDO_TRANSFER_AMOUNT]),
        event(contracts.agent, "VaultTransfer", [contracts.ldo.address, PML_MULTISIG, PML_LDO_TRANSFER_AMOUNT]),
      ],
    }),

    submitCalls("9. Submit proposal to Dual Governance with the following calls:", contracts.dualGovernance, [
      forwardCall("9.1. Forward call to Agent update staking limit on", contracts.agent, {
        on: contracts.stakingRouter,
        fn: "setStakingModuleStatus",
        args: [CURATED_STAKING_MODULE_ID, DEPOSIT_PAUSED_STATUS],
        events: [
          event(contracts.stakingRouter, "StakingModuleStatusSet", [
            CURATED_STAKING_MODULE_ID,
            DEPOSIT_PAUSED_STATUS,
            contracts.agent.address,
          ]),
        ],
      }),
      executeCall("9.2. Execute calls via Agent to transfer ETH", contracts.agent, {
        on: contracts.stETH,
        fn: "submit",
        args: [contracts.agent.address],
        value: STETH_SUBMIT_AMOUNT,
        events: [
          event(contracts.stETH, "Submitted", [contracts.agent.address, STETH_SUBMIT_AMOUNT, /* referral  */ null]),
          event(contracts.stETH, "Transfer", [
            /* from */ zeroAddress,
            /* to */ contracts.agent.address,
            // value may differ in a couple of weis due to stETH rounding
            /* value */ (value) => assert.approximately(value, STETH_SUBMIT_AMOUNT, 1n),
          ]),
          event(contracts.stETH, "TransferShares", [zeroAddress, contracts.agent.address, null]),
        ],
      }),
      forwardCalls(
        `9.3. Forward ${NEW_NODE_OPERATORS.length} calls via Aragon Agent to add new Node Operators to the Curated Module`,
        contracts.agent,
        NEW_NODE_OPERATORS.map((operator, i) =>
          blueprints.stakingModule.addNodeOperator(
            `9.3.${i + 1}. Add node operator "${operator.name}" with the reward address ${operator.rewardAddress} to Curated module`,
            { stakingModule: contracts.curatedStakingModule, operator },
          ),
        ),
      ),
    ]),
  ],

  testVote: async ({ client, checks, passOmnibus }) => {
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

    const { submittedProposalIds } = await passOmnibus();

    assert.equal(submittedProposalIds.length, 1);

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

  testProposal: async ({ client, checks, passProposals }) => {
    const nodeOperatorsCountBefore = await client.read(contracts.curatedStakingModule, "getNodeOperatorsCount", []);

    await passProposals();

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
