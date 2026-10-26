import { Address } from "abitype";

import { StakingRouter_ABI } from "../../../abi/StakingRouter.abi";
import { Contract } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

type StakingRouterContract = Contract<typeof StakingRouter_ABI>;

interface StakingModuleParams {
  stakingModuleId: bigint;
  stakeShareLimit: bigint;
  priorityExitShareThreshold: bigint;
  stakingModuleFee: bigint;
  treasuryFee: bigint;
  maxDepositsPerBlock: bigint;
  minDepositBlockDistance: bigint;
}

function moduleUpdated(stakingRouter: StakingRouterContract, input: StakingModuleParams): OmnibusCallEvent[] {
  const { stakingModuleId } = input;
  return [
    event(stakingRouter, "StakingModuleShareLimitSet", [
      stakingModuleId,
      input.stakeShareLimit,
      input.priorityExitShareThreshold,
      null,
    ]),
    event(stakingRouter, "StakingModuleFeesSet", [stakingModuleId, input.stakingModuleFee, input.treasuryFee, null]),
    event(stakingRouter, "StakingModuleMaxDepositsPerBlockSet", [stakingModuleId, input.maxDepositsPerBlock, null]),
    event(stakingRouter, "StakingModuleMinDepositBlockDistanceSet", [
      stakingModuleId,
      input.minDepositBlockDistance,
      null,
    ]),
  ];
}

function moduleSharesUpdated(
  stakingRouter: StakingRouterContract,
  input: { stakingModuleId: bigint; stakeShareLimit: bigint; priorityExitShareThreshold: bigint },
): OmnibusCallEvent[] {
  return [
    event(stakingRouter, "StakingModuleShareLimitSet", [
      input.stakingModuleId,
      input.stakeShareLimit,
      input.priorityExitShareThreshold,
      null,
    ]),
  ];
}

function moduleAdded(
  stakingRouter: StakingRouterContract,
  input: StakingModuleParams & { stakingModuleAddress: Address; name: string },
): OmnibusCallEvent[] {
  return [
    event(stakingRouter, "StakingModuleAdded", [input.stakingModuleId, input.stakingModuleAddress, input.name, null]),
    ...moduleUpdated(stakingRouter, input),
  ];
}

function moduleStatusSet(
  stakingRouter: StakingRouterContract,
  input: { stakingModuleId: bigint; status: number },
): OmnibusCallEvent[] {
  return [event(stakingRouter, "StakingModuleStatusSet", [input.stakingModuleId, input.status, null])];
}

export default { moduleUpdated, moduleSharesUpdated, moduleAdded, moduleStatusSet };
