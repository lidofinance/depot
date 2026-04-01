import { BigNumberish } from 'ethers'

import { assert } from '../../common/assert'

import { CheckContext } from './checks'

export interface StakingModuleParams {
  targetShare: bigint
  treasuryFee: bigint
  stakingModuleFee: bigint
}

const checkStakingModule = async (
  { contracts }: CheckContext,
  stakingModuleID: BigNumberish,
  params: StakingModuleParams,
) => {
  const stakingModule = await contracts.stakingRouter.getStakingModule(stakingModuleID)

  assert.equal(stakingModule.targetShare, params.targetShare)
  assert.equal(stakingModule.treasuryFee, params.treasuryFee)
  assert.equal(stakingModule.stakingModuleFee, params.stakingModuleFee)
}

const checkNodeOperator = async (
  { contracts }: CheckContext,
  nopID: BigNumberish,
  name: string,
  rewardAddress: `0x${string}`,
) => {
  const nopInfo = await contracts.curatedStakingModule.getNodeOperator(nopID, false)

  assert.equal(nopInfo.rewardAddress, rewardAddress, `Operator ${name} not found`)
}

const checkNodeOperatorsCount = async ({ contracts }: CheckContext, expectedCount: BigNumberish) => {
  const nodeOperatorsCount = await contracts.curatedStakingModule.getNodeOperatorsCount()

  assert.equal(nodeOperatorsCount, expectedCount)
}

export default {
  checkStakingModule,
  checkNodeOperator,
  checkNodeOperatorsCount,
}
