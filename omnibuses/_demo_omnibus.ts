import omnibuses from "../src/omnibuses/omnibuses";
import { StakingModule } from "../src/lido/lido";
import { call, event } from "../src/votes";

export default omnibuses.create({
  network: "mainnet",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  items: ({ actions, contracts }) => [
    actions.stakingRouter.updateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 4_00,
      treasuryFee: 2_00,
      stakingModuleFee: 8_00,
    }),
    actions.easyTrack.addPaymentEvmScriptFactories({
      name: "reWARDS stETH",
      factories: {
        topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      },
      registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
    }),
    actions.tokens.transferLDO({
      title: "Transfer 110,000 LDO to Argo Technology Consulting Ltd. (ATC) multisig",
      to: "0x9B1cebF7616f2BC73b47D226f90b01a7c9F86956", // Argo Technology Consulting Ltd. (ATC) multisig
      amount: 110_000n * 10n ** 18n,
    }),
    actions.easyTrack.removePaymentEvmScriptFactories({
      name: "reWARDS LDO",
      factories: {
        topUp: "0x200dA0b6a9905A377CF8D469664C65dB267009d1",
        addRecipient: "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
        removeRecipient: "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
      },
    }),
    actions.stakingRouter.addNodeOperators({
      operators: [
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
      ],
    }),
    {
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      evmCall: call(contracts.finance.newImmediatePayment, [
        contracts.ldo,
        "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
        180000n * 10n ** 18n,
        "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      ]),
      expectedEvents: [
        event(contracts.callsScript, "LogScriptCall", { emitter: contracts.voting }),
        event(contracts.finance, "NewPeriod", undefined, { optional: true }),
        event(contracts.finance, "NewTransaction", {
          args: [
            undefined,
            false,
            "0x17F6b2C738a63a8D3A113a228cfd0b373244633D",
            180000n * 10n ** 18n,
            "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
          ],
        }),
        event(contracts.ldo, "Transfer", {
          args: [contracts.agent, "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", 180000n * 10n ** 18n],
        }),
        event(contracts.agent, "VaultTransfer", {
          args: [contracts.ldo, "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", 180000n * 10n ** 18n],
        }),
      ],
    },
  ],
});
