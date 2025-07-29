import { assert } from "chai";
import { Omnibus } from "../src/omnibuses/omnibus";

const aragonVoteDescription = `
1. **Expanding the Simple DVT Module:** Increase the Simple DVT module's staking share limit from 0.5% to 4%, as decided in the [Snapshot vote](https://snapshot.org/#/lido-snapshot.eth/proposal/0xaca2da3c932542e030db8bf5b6e4420bf4aa98bd57bd62b9b8008a4b7398abb2).
2. **Lido Contributors Group Funding:** Trans fer 180,000 LDO within the [EGG st2024 v2 Grant Funding](https://snapshot.org/#/lido-snapshot.eth/proposal/0x2baf3275d15a8494ff94fef58d93bedd2fc28bfea8519f7e86474fc72dc25076) to the [PML multisig](https://app.safe.global/settings/setup?safe=eth:0x17F6b2C738a63a8D3A113a228cfd0b373244633D).
`;

const dgProposalDescription = `
Add new node operators
`;

const ATC_STABLES_MULTISIG = "0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956";
const ATC_STABLES_LDO_TRANSFER_AMOUNT = 110_000n * 10n ** 18n;

const LUCKY_WALLET = "0x0000000000000000000000000000000000000777";
const LUCKY_WALLET_LDO_TRANSFER_AMOUNT = 10_000n * 10n ** 18n;

const PML_MULTISIG = "0x17F6b2C738a63a8D3A113a228cfd0b373244633D";
const PML_LDO_TRANSFER_AMOUNT = 180_000n * 10n ** 18n;

// Testing values
const expectedTargetShare = 4_00;
const expectedTreasuryFee = 2_00;
const expectedStakingModuleFee = 8_00;

const NEW_NODE_OPERATORS = [
  {
    name: "A41",
    rewardAddress: "0x2A64944eBFaFF8b6A0d07B222D3d83ac29c241a7",
  },
  {
    name: "Develp GmbH",
    rewardAddress: "0x0a6a0b60fFeF196113b3530781df6e747DdC565e",
  },
  {
    name: "Ebunker",
    rewardAddress: "0x2A2245d1f47430b9f60adCFC63D158021E80A728",
  },
  {
    name: "Gateway.fm AS",
    rewardAddress: "0x78CEE97C23560279909c0215e084dB293F036774",
  },
  {
    name: "Numic",
    rewardAddress: "0x0209a89b6d9F707c14eB6cD4C3Fb519280a7E1AC",
  },
  {
    name: "ParaFi Technologies LLC",
    rewardAddress: "0x5Ee590eFfdf9456d5666002fBa05fbA8C3752CB7",
  },
  {
    name: "RockawayX Infra",
    rewardAddress: "0xcA6817DAb36850D58375A10c78703CE49d41D25a",
  },
] as const;

const addFactoryValues = {
  name: "reWARDS stETH",
  factories: {
    topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d" as `0x${string}`,
    addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C" as `0x${string}`,
    removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E" as `0x${string}`,
  },
  token: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32" as `0x${string}`, // stETH
  registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A" as `0x${string}`,
  trustedCaller: "0x87D93d9B2C672bf9c9642d853a8682546a5012B5" as `0x${string}`,
};

const removeFactoryValues = {
  name: "reWARDS LDO",
  factories: {
    topUp: "0x200dA0b6a9905A377CF8D469664C65dB267009d1" as `0x${string}`,
    addRecipient: "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252" as `0x${string}`,
    removeRecipient: "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7" as `0x${string}`,
  },
};

export default Omnibus.create({
  network: "mainnet",
  description: aragonVoteDescription,
  launchedOn: undefined, // Launch block number should be set only if omnibus was successfully launched.
  voteId: undefined, // Vote ID should be set only if omnibus is already started.
  executedOn: undefined, // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: undefined, // Should be set to true if quorum was reached during the vote.

  calls: ({ blueprints, contracts, call, event, submitProposal, forward }) => [
    ...blueprints.easyTrack.addPaymentEvmScriptFactories({
      name: "reWARDS stETH",
      factories: {
        topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      },
      registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
    }),

    blueprints.tokens.transferLDO({
      title: "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
      to: ATC_STABLES_MULTISIG,
      amount: ATC_STABLES_LDO_TRANSFER_AMOUNT,
    }),

    blueprints.tokens.transferLDO({
      title: "Transfer 10,000 LDO to Lucky Wallet",
      to: LUCKY_WALLET,
      amount: LUCKY_WALLET_LDO_TRANSFER_AMOUNT,
    }),

    ...blueprints.easyTrack.removePaymentEvmScriptFactories({
      name: "reWARDS LDO",
      factories: {
        topUp: "0x200dA0b6a9905A377CF8D469664C65dB267009d1",
        addRecipient: "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
        removeRecipient: "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
      },
    }),

    call(
      contracts.finance,
      "newImmediatePayment",
      [
        contracts.ldo.address,
        PML_MULTISIG,
        PML_LDO_TRANSFER_AMOUNT,
        "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      ],
      {
        title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
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
      },
    ),

    submitProposal(contracts.dualGovernance, {
      description: dgProposalDescription,
      calls: [
        forward(
          contracts.agent,
          blueprints.stakingRouter.addNodeOperators({
            module: "curated",
            operators: NEW_NODE_OPERATORS,
          }),
        ),
      ],
    }),
  ],

  test: async ({ contracts, client, checks, passOmnibus, passProposals }) => {
    const { ldo, agent, curatedStakingModule } = contracts;

    await checks.stakingRouter.checkStakingModule("sdvt", {
      treasuryFee: 2_00,
      stakingModuleFee: 8_00,
    });

    const [
      agentLdoBalanceBefore,
      atcLdoBalanceBefore,
      pmlLdoBalanceBefore,
      luckyWalletLdoBalanceBefore,
      nodeOperatorsCountBefore,
    ] = await Promise.all([
      client.read(ldo, "balanceOf", [agent.address]),
      client.read(ldo, "balanceOf", [ATC_STABLES_MULTISIG]),
      client.read(ldo, "balanceOf", [PML_MULTISIG]),
      client.read(ldo, "balanceOf", [LUCKY_WALLET]),
      client.read(curatedStakingModule, "getNodeOperatorsCount", []),
    ]);

    const { submittedProposalIds } = await passOmnibus();

    assert.equal(submittedProposalIds.length, 1);

    await checks.tokens.checkLDOBalance(ATC_STABLES_MULTISIG, atcLdoBalanceBefore + ATC_STABLES_LDO_TRANSFER_AMOUNT);
    await checks.tokens.checkLDOBalance(PML_MULTISIG, pmlLdoBalanceBefore + PML_LDO_TRANSFER_AMOUNT);
    await checks.tokens.checkLDOBalance(LUCKY_WALLET, luckyWalletLdoBalanceBefore + LUCKY_WALLET_LDO_TRANSFER_AMOUNT);
    await checks.tokens.checkLDOBalance(
      contracts.agent.address,
      agentLdoBalanceBefore -
        ATC_STABLES_LDO_TRANSFER_AMOUNT -
        PML_LDO_TRANSFER_AMOUNT -
        LUCKY_WALLET_LDO_TRANSFER_AMOUNT,
    );

    await passProposals(submittedProposalIds);

    await checks.stakingRouter.checkStakingModule("sdvt", {
      treasuryFee: expectedTreasuryFee,
      stakingModuleFee: expectedStakingModuleFee,
    });

    const expectedNodeOperatorsCount = nodeOperatorsCountBefore + BigInt(NEW_NODE_OPERATORS.length);
    await checks.stakingRouter.checkNodeOperatorsCount("curated", expectedNodeOperatorsCount);

    for (let i = 0; i < NEW_NODE_OPERATORS.length; i++) {
      const operator = NEW_NODE_OPERATORS[i];
      const operatorIndex = nodeOperatorsCountBefore + BigInt(i);

      await checks.stakingRouter.checkNodeOperator("curated", operatorIndex, {
        name: operator.name,
        rewardAddress: operator.rewardAddress,
      });
    }

    await checks.easyTrack.checkFactoryExists(addFactoryValues.factories.topUp);
    await checks.easyTrack.checkTopUpFactory(
      addFactoryValues.token,
      addFactoryValues.factories.topUp,
      addFactoryValues.registry,
      addFactoryValues.trustedCaller,
    );

    await checks.easyTrack.checkFactoryExists(addFactoryValues.factories.addRecipient);
    await checks.easyTrack.checkAddRecipientFactory(
      addFactoryValues.factories.addRecipient,
      addFactoryValues.registry,
      addFactoryValues.trustedCaller,
    );

    await checks.easyTrack.checkFactoryExists(addFactoryValues.factories.removeRecipient);
    await checks.easyTrack.checkRemoveRecipientFactory(
      addFactoryValues.factories.removeRecipient,
      addFactoryValues.registry,
      addFactoryValues.trustedCaller,
    );

    await checks.easyTrack.checkFactoryNotExists(removeFactoryValues.factories.topUp);
    await checks.easyTrack.checkFactoryNotExists(removeFactoryValues.factories.addRecipient);
    await checks.easyTrack.checkFactoryNotExists(removeFactoryValues.factories.removeRecipient);
  },
});
