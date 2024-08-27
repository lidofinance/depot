import { Contracts } from "../../contracts/contracts";
import LidoOnMainnet from "../../../configs/lido-on-mainnet";
import { BigNumberish } from "ethers";
import { assert } from "../../common/assert";

export interface StakingModuleParams {
  targetShare: bigint;
  treasuryFee: bigint;
  stakingModuleFee: bigint;
}

export const checkStakingModule =
  (contracts: Contracts<typeof LidoOnMainnet>) =>
  async (stakingModuleID: BigNumberish, params: StakingModuleParams) => {
    const stakingModule = await contracts.stakingRouter.getStakingModule(stakingModuleID);

    assert.equal(stakingModule.targetShare, params.targetShare);
    assert.equal(stakingModule.treasuryFee, params.treasuryFee);
    assert.equal(stakingModule.stakingModuleFee, params.stakingModuleFee);
  };
