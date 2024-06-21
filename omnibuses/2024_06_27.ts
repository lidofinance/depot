import { Omnibus } from "../src/omnibuses/omnibus";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { StakingModule } from "../src/lido/lido";

export default new Omnibus({
  network: "mainnet",
  voteId: 175,
  // execution: { date: "Jun-30-2023 06:46:23 PM UTC", blockNumber: 17593962 },
  launching: { date: "Jun-27-2024" /* blockNumber: 17572253 */ },
  actions: ({ ldo }) => [
    new UpdateStakingModule({
      title: "Raise Simple DVT target share from 0.5% to 4%",
      stakingModuleId: StakingModule.SimpleDVT,
      targetShare: 400,
      treasuryFee: 5,
      stakingModuleFee: 10,
    }),
    new TransferAssets({
      title: "Transfer 180,000 LDO to Pool Maintenance Labs Ltd. (PML) multisig",
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", // Pool Maintenance Labs Ltd. (PML) multisig
      token: ldo,
      amount: 180000n * 10n ** 18n,
    }),
  ],
});
