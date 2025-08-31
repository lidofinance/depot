import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { BlueprintCtx } from "../omnibus";

export enum StakingModule {
  CuratedStakingModule = 1,
  SimpleDVT = 2,
  CSModule = 3,
}

interface UpdateStakingModuleInput {
  title: string;
  stakingModuleId: bigint;
  stakeShareLimit: bigint;
  priorityExitShareThreshold: bigint;
  stakingModuleFee: bigint;
  treasuryFee: bigint;
  maxDepositsPerBlock: bigint;
  minDepositBlockDistance: bigint;
}

function updateStakingModule(ctx: BlueprintCtx, input: UpdateStakingModuleInput): OmnibusDirectCall {
  const { stakingRouter } = ctx.contracts;
  const {
    stakingModuleId,
    stakeShareLimit,
    priorityExitShareThreshold,
    stakingModuleFee,
    treasuryFee,
    maxDepositsPerBlock,
    minDepositBlockDistance,
  } = input;

  return ctx.directCall(input.title, {
    on: stakingRouter,
    fn: "updateStakingModule",
    args: [
      stakingModuleId,
      stakeShareLimit,
      priorityExitShareThreshold,
      stakingModuleFee,
      treasuryFee,
      maxDepositsPerBlock,
      minDepositBlockDistance,
    ],
    events: [
      ctx.event(stakingRouter, "StakingModuleShareLimitSet", [
        stakingModuleId,
        stakeShareLimit,
        priorityExitShareThreshold,
        null,
      ]),
      ctx.event(stakingRouter, "StakingModuleFeesSet", [stakingModuleId, stakingModuleFee, treasuryFee, null]),
      ctx.event(stakingRouter, "StakingModuleMaxDepositsPerBlockSet", [stakingModuleId, maxDepositsPerBlock, null]),
      ctx.event(stakingRouter, "StakingModuleMinDepositBlockDistanceSet", [
        stakingModuleId,
        minDepositBlockDistance,
        null,
      ]),
    ],
  });
}

export default {
  updateStakingModule,
};
