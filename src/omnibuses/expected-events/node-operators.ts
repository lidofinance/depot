import { Address } from "abitype";

import { NodeOperatorsRegistry_ABI } from "../../../abi/NodeOperatorsRegistry.abi";
import { Contract } from "../../contracts";
import { event } from "../event-helpers";
import { OmnibusCallEvent } from "../omnibus-types";

type NodeOperatorsRegistryContract = Contract<typeof NodeOperatorsRegistry_ABI>;

function nameSet(
  registry: NodeOperatorsRegistryContract,
  input: { nodeOperatorId: bigint; name: string },
): OmnibusCallEvent[] {
  return [event(registry, "NodeOperatorNameSet", [input.nodeOperatorId, input.name])];
}

function rewardAddressSet(
  registry: NodeOperatorsRegistryContract,
  input: { nodeOperatorId: bigint; rewardAddress: Address },
): OmnibusCallEvent[] {
  return [event(registry, "NodeOperatorRewardAddressSet", [input.nodeOperatorId, input.rewardAddress])];
}

function activeSet(
  registry: NodeOperatorsRegistryContract,
  input: { nodeOperatorId: bigint; active: boolean },
): OmnibusCallEvent[] {
  return [event(registry, "NodeOperatorActiveSet", [input.nodeOperatorId, input.active])];
}

export default { nameSet, rewardAddressSet, activeSet };
