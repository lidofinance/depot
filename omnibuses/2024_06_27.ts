import { Omnibus } from "../src/omnibuses/omnibus";
import { UpdateStakingModule } from "../src/omnibuses/actions/update-staking-module";

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
  ],
});
