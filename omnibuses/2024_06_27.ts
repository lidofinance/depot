import { Omnibus } from "../src/omnibuses/omnibus";
import { TransferAssets } from "../src/omnibuses/actions/transfer-assets";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";
import { LDO_ADDRESS } from "../src/votes/constants";

export default new Omnibus({
  network: "mainnet",
  voteId: 175,
  // execution: { date: "Jun-30-2023 06:46:23 PM UTC", blockNumber: 17593962 },
  launching: { date: "Jun-27-2024" /* blockNumber: 17572253 */ },
  actions: ({}) => [
    new UpdateStakingModule({
      stakingModuleId: 2,
      targetShare: 400,
      treasuryFee: 5,
      stakingModuleFee: 10,
    }),
    new TransferAssets({
      to: "0x17F6b2C738a63a8D3A113a228cfd0b373244633D", // Pool Maintenance Labs Ltd. (PML) multisig
      token: LDO_ADDRESS,
      amount: 180000n * 10n ** 18n,
    }),
  ],
});
