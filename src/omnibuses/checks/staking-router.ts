import { Address } from "abitype";
import { CheckContext } from "./checks";
import { assert } from "../../common/assert";
import { LidoContracts } from "../../contracts/contracts";

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

const checkStakingModule = async (
  { contracts, client }: CheckContext,
  stakingModuleName: StakingModuleName,
  params: StakingModuleParams,
) => {
  const { stakingRouter } = contracts;

  const stakingModuleId = getStakingModuleId(stakingModuleName);
  const stakingModuleInfo = await client.read(stakingRouter, "getStakingModule", [stakingModuleId]);

  assert.equal(stakingModuleInfo.treasuryFee, params.treasuryFee);
  assert.equal(stakingModuleInfo.stakingModuleFee, params.stakingModuleFee);
};

interface CheckNodeOperatorParams {
  active?: boolean;
  name?: string;
  rewardAddress?: Address;
}

const checkNodeOperator = async (
  { contracts, client }: CheckContext,
  stakingModuleName: StakingModuleName,
  operatorId: bigint,
  expected: CheckNodeOperatorParams,
) => {
  const stakingModule =
    stakingModuleName === "curated"
      ? contracts.curatedStakingModule
      : stakingModuleName === "sdvt"
        ? contracts.simpleDvt
        : null;

  if (!stakingModule) {
    throw new Error(`Unsupported staking module type "${stakingModuleName}"`);
  }

  const [active, name, rewardAddress] = await client.read(stakingModule, "getNodeOperator", [operatorId, true]);

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

async function checkNodeOperatorsCount(ctx: CheckContext, stakingModuleName: StakingModuleName, expectedCount: bigint) {
  const stakingModule = getStakingModuleContract(ctx.contracts, stakingModuleName);

  const nodeOperatorsCount = await ctx.client.read(stakingModule, "getNodeOperatorsCount", []);

  assert.equal(nodeOperatorsCount, expectedCount);
}

function getStakingModuleId(stakingModuleName: StakingModuleName) {
  const stakingModuleId = STAKING_MODULE_IDS[stakingModuleName];
  if (!stakingModuleId) {
    throw new Error(`Unsupported staking module type "${stakingModuleName}"`);
  }
  return stakingModuleId;
}

function getStakingModuleContract(contracts: LidoContracts, stakingModuleName: StakingModuleName) {
  if (stakingModuleName === "curated") {
    return contracts.curatedStakingModule;
  } else if (stakingModuleName === "sdvt") {
    return contracts.simpleDvt;
  } else if (stakingModuleName === "csm") {
    return contracts.csModule;
  }
  throw new Error(`Unsupported staking module type "${stakingModuleName}"`);
}

export default {
  checkStakingModule,
  checkNodeOperator,
  checkNodeOperatorsCount,
};
