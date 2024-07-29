import { Omnibus } from "../src/omnibuses/omnibus";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { StakingModule } from "../src/lido/lido";
import { AddNodeOperators } from "../src/omnibuses/actions/add-node-operators";
import { AddPaymentEvmScriptFactories } from "../src/omnibuses/actions/add-payment-evm-script-factories";
import { RemovePaymentEvmScriptFactories } from "../src/omnibuses/actions/remove-payment-evm-script-factories";

export default new Omnibus({
  network: "mainnet",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  actions: ({ ldo, stETH }) => [
    new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%", // Title is always required
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 400,
      treasuryFee: 800,
      stakingModuleFee: 200,
    }),
    new TransferAssets({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", // Pool Maintenance Labs Ltd. (PML) multisig
      token: ldo,
      amount: 180000n * 10n ** 18n,
    }),
    new AddNodeOperators({
      nodeOperatorsCountBefore: 32,
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
    new AddPaymentEvmScriptFactories({
      name: "reWARDS stETH",
      factories: {
        topUp: "0x85d703B2A4BaD713b596c647badac9A1e95bB03d",
        addRecipient: "0x1dCFc37719A99d73a0ce25CeEcbeFbF39938cF2C",
        removeRecipient: "0x00BB68a12180a8f7E20D8422ba9F81c07A19A79E",
      },
      token: stETH.address,
      registry: "0xAa47c268e6b2D4ac7d7f7Ffb28A39484f5212c2A",
      trustedCaller: "0x87D93d9B2C672bf9c9642d853a8682546a5012B5",
    }),
    new RemovePaymentEvmScriptFactories({
      name: "reWARDS LDO",
      factories: {
        topUp: "0x200dA0b6a9905A377CF8D469664C65dB267009d1",
        addRecipient: "0x48c135Ff690C2Aa7F5B11C539104B5855A4f9252",
        removeRecipient: "0x7E8eFfAb3083fB26aCE6832bFcA4C377905F97d7",
      },
    }),
  ],
});
