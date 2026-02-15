import { Address } from "abitype";
import { CheckContext } from "./checks";
import { assert } from "../../common/assert";
import { StakingRouter_ABI } from "../../../abi/StakingRouter.abi";
import { Contract } from "../../contracts";
import { NodeOperatorsRegistry_ABI } from "../../../abi/NodeOperatorsRegistry.abi";
import { CSModule_ABI } from "../../../abi/CSModule.abi";

export interface StakingModuleParams {
  treasuryFee: number;
  stakingModuleFee: number;
}

type StakingModuleName = "curated" | "sdvt" | "csm";
const STAKING_MODULE_IDS = {
  curated: 1n,
  sdvt: 2n,
  csm: 3n,
};

interface CheckStakingModuleFeeInput {
  stakingModuleId: number | bigint;
  treasuryFee: number | bigint;
  stakingModuleFee: number | bigint;
}

const checkStakingModuleFee = async (
  { client }: CheckContext,
  { stakingRouter }: { stakingRouter: Contract<typeof StakingRouter_ABI> },
  input: CheckStakingModuleFeeInput,
) => {
  const stakingModuleId = BigInt(input.stakingModuleId);
  const stakingModuleInfo = await client.read(stakingRouter, "getStakingModule", [stakingModuleId]);

  assert.equal(stakingModuleInfo.treasuryFee, input.treasuryFee);
  assert.equal(stakingModuleInfo.stakingModuleFee, input.stakingModuleFee);
};

interface CheckNodeOperatorInput {
  stakingModule: Contract<typeof NodeOperatorsRegistry_ABI>;
  operatorId: bigint | number;
  active?: boolean;
  name?: string;
  rewardAddress?: Address;
}

const checkNodeOperator = async ({ client }: CheckContext, input: CheckNodeOperatorInput) => {
  const { stakingModule, operatorId, ...expected } = input;

  const [active, name, rewardAddress] = await client.read(stakingModule, "getNodeOperator", [BigInt(operatorId), true]);

  if (expected.active !== undefined) {
    assert.equal(active, expected.active);
  }
  if (expected.name !== undefined) {
    assert.equal(name, expected.name);
  }
  if (expected.rewardAddress !== rewardAddress) {
    assert.equal(expected.rewardAddress, rewardAddress);
  }
};

interface CheckNodeOperatorsCountInput {
  stakingModule: Contract<typeof NodeOperatorsRegistry_ABI> | Contract<typeof CSModule_ABI>;
  nodeOperatorsCount: bigint | number;
}

async function checkNodeOperatorsCount(ctx: CheckContext, input: CheckNodeOperatorsCountInput) {
  const nodeOperatorsCount = await ctx.client.read(input.stakingModule, "getNodeOperatorsCount", []);

  assert.equal(nodeOperatorsCount, input.nodeOperatorsCount);
}

function getStakingModuleId(stakingModuleName: StakingModuleName) {
  const stakingModuleId = STAKING_MODULE_IDS[stakingModuleName];
  if (!stakingModuleId) {
    throw new Error(`Unsupported staking module type "${stakingModuleName}"`);
  }
  return stakingModuleId;
}

export default {
  checkStakingModuleFee,
  checkNodeOperator,
  checkNodeOperatorsCount,
};
