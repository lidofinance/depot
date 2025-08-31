import { Address } from "abitype";
import { Contract } from "../../contracts";
import { NodeOperatorsRegistry_ABI } from "../../../abi/NodeOperatorsRegistry.abi";
import { BlueprintCtx } from "../omnibus";

interface SetNodeOperatorRewardAddressInput {
  title: string;
  module: Contract<typeof NodeOperatorsRegistry_ABI>;
  nodeOperatorId: bigint;
  rewardAddress: Address;
}

interface SetNodeOperatorNameInput {
  title: string;
  module: Contract<typeof NodeOperatorsRegistry_ABI>;
  nodeOperatorId: bigint;
  name: string;
}

function setNodeOperatorRewardAddressCall(ctx: BlueprintCtx, input: SetNodeOperatorRewardAddressInput) {
  return ctx.directCall(input.title, {
    on: input.module,
    fn: "setNodeOperatorRewardAddress",
    args: [input.nodeOperatorId, input.rewardAddress],
    events: [ctx.event(input.module, "NodeOperatorRewardAddressSet", [input.nodeOperatorId, input.rewardAddress])],
  });
}

function setNodeOperatorNameCall(ctx: BlueprintCtx, input: SetNodeOperatorNameInput) {
  return ctx.directCall(input.title, {
    on: input.module,
    fn: "setNodeOperatorName",
    args: [input.nodeOperatorId, input.name],
    events: [ctx.event(input.module, "NodeOperatorNameSet", [input.nodeOperatorId, input.name])],
  });
}

interface AddNodeOperatorInput {
  module: "curated" | "sdvt";
  operator: { name: string; rewardAddress: Address };
}

function addNodeOperator(ctx: BlueprintCtx, title: string, input: AddNodeOperatorInput) {
  const { curatedStakingModule, simpleDvt } = ctx.contracts;
  const {
    module,
    operator: { name, rewardAddress },
  } = input;

  const stakingModule = module === "curated" ? curatedStakingModule : module === "sdvt" ? simpleDvt : null;
  if (!stakingModule) {
    throw new Error(`Unsupported staking module type "${input.module}"`);
  }

  return ctx.directCall(title, {
    on: stakingModule,
    fn: "addNodeOperator",
    args: [name, rewardAddress],
    events: [ctx.event(stakingModule, "NodeOperatorAdded", [null, name, rewardAddress, 0n])],
  });
}

export default { addNodeOperator, setNodeOperatorRewardAddressCall, setNodeOperatorNameCall };
