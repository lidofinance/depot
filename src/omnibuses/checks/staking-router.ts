import { Contracts } from "../../contracts/contracts";
import { BigNumberish } from "ethers";
import { assert } from "../../common/assert";
import { Lido } from "../../../configs/types";

export interface StakingModuleParams {
  targetShare: bigint;
  treasuryFee: bigint;
  stakingModuleFee: bigint;
}

export const checkStakingModule = async (
  contracts: Contracts<Lido>,
  stakingModuleID: BigNumberish,
  params: StakingModuleParams,
) => {
  const stakingModule = await contracts.stakingRouter.getStakingModule(stakingModuleID);

  assert.equal(stakingModule.targetShare, params.targetShare);
  assert.equal(stakingModule.treasuryFee, params.treasuryFee);
  assert.equal(stakingModule.stakingModuleFee, params.stakingModuleFee);
};

export const checkNodeOperator = async (
  contracts: Contracts<Lido>,
  nopID: BigNumberish,
  name: string,
  rewardAddress: `0x${string}`,
) => {
  const nopInfo = await contracts.curatedStakingModule.getNodeOperator(nopID, false);

  assert.equal(nopInfo.rewardAddress, rewardAddress, `Operator ${name} not found`);
};

export const checkNodeOperatorsCount = async (contracts: Contracts<Lido>, expectedCount: BigNumberish) => {
  const nodeOperatorsCount = await contracts.curatedStakingModule.getNodeOperatorsCount();

  assert.equal(nodeOperatorsCount, expectedCount);
};
