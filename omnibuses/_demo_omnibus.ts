import { Omnibus } from "../src/omnibuses/omnibus";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { StakingModule } from "../src/lido/lido";
import { AddNodeOperators } from "../src/omnibuses/actions/add-node-operators";

export default new Omnibus({
  network: "mainnet",
  // launchedOn: 12345678, // Launch block number should be set only if omnibus was successfully launched.
  // voteId: 000, // Vote ID should be set only if omnibus is already started.
  // executedOn: 12345678,  // Execution block number should be set only if vote is passed and omnibus was successfully executed.
  quorumReached: false, // Should be set to true if quorum was reached during the vote.
  actions: ({ ldo }) => [
    new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%", // Title is always required
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 400,
      treasuryFee: 5,
      stakingModuleFee: 10,
    }),
    new TransferAssets({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig", // Title is always required
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", // Pool Maintenance Labs Ltd. (PML) multisig
      token: ldo,
      amount: 180000n * 10n ** 18n,
    }),
    new AddNodeOperators({
      title: "Add 7 new node operators", // Title is always required
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
  ],
});
