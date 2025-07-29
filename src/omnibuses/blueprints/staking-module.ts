import { Address } from "abitype";
import { BlueprintCtx } from "../tools/create-omnibus";
import { Contract } from "../../contracts";
import { NodeOperatorsRegistry_ABI } from "../../../abi/NodeOperatorsRegistry.abi";

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
  return ctx.call(input.module, "setNodeOperatorRewardAddress", [input.nodeOperatorId, input.rewardAddress], {
    title: input.title,
    events: [ctx.event(input.module, "NodeOperatorRewardAddressSet", [input.nodeOperatorId, input.rewardAddress])],
  });
}

function setNodeOperatorNameCall(ctx: BlueprintCtx, input: SetNodeOperatorNameInput) {
  return ctx.call(input.module, "setNodeOperatorName", [input.nodeOperatorId, input.name], {
    title: input.title,
    events: [ctx.event(input.module, "NodeOperatorNameSet", [input.nodeOperatorId, input.name])],
  });
}

export default { setNodeOperatorRewardAddressCall, setNodeOperatorNameCall };
