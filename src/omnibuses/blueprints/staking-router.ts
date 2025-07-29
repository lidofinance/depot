import { Address } from "viem";
import { OmniScriptCtx } from "../tools/create-omnibus";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";

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

interface NewNodeOperatorInput {
  name: string;
  rewardAddress: Address;
}

interface AddNodeOperatorsInput {
  module: "curated" | "sdvt";
  operators: NewNodeOperatorInput[] | readonly NewNodeOperatorInput[];
}

function updateStakingModule(ctx: OmniScriptCtx, input: UpdateStakingModuleInput): OmnibusDirectCall {
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

  return ctx.call(
    stakingRouter,
    "updateStakingModule",
    [
      stakingModuleId,
      stakeShareLimit,
      priorityExitShareThreshold,
      stakingModuleFee,
      treasuryFee,
      maxDepositsPerBlock,
      minDepositBlockDistance,
    ],
    {
      title: `Update "${StakingModule[Number(stakingModuleId)]}" staking module`,
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
    },
  );
}

function addNodeOperators(ctx: OmniScriptCtx, input: AddNodeOperatorsInput): OmnibusDirectCall[] {
  const { curatedStakingModule, simpleDvt } = ctx.contracts;
  const { module, operators } = input;

  const stakingModule = module === "curated" ? curatedStakingModule : module === "sdvt" ? simpleDvt : null;
  if (!stakingModule) {
    throw new Error(`Unsupported staking module type "${input.module}"`);
  }
  return operators.map(({ name, rewardAddress }) => {
    return ctx.call(stakingModule, "addNodeOperator", [name, rewardAddress], {
      title: `Add node operator ${name} with reward address ${rewardAddress}`,
      events: [ctx.event(stakingModule, "NodeOperatorAdded", [null, name, rewardAddress, 0n])],
    });
  });
}

export default {
  addNodeOperators,
  updateStakingModule,
};
