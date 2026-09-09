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
  input: { nodeOperatorId: bigint; active: boolean; nonce: bigint; vettedSigningKeysCount?: bigint },
): OmnibusCallEvent[] {
  const events = [event(registry, "NodeOperatorActiveSet", [input.nodeOperatorId, input.active])];
  if (input.vettedSigningKeysCount !== undefined) {
    events.push(event(registry, "VettedSigningKeysCountChanged", [input.nodeOperatorId, input.vettedSigningKeysCount]));
  }
  return [...events, ...nonceChanged(registry, input.nonce)];
}

function nonceChanged(registry: NodeOperatorsRegistryContract, nonce: bigint): OmnibusCallEvent[] {
  return [event(registry, "KeysOpIndexSet", [nonce]), event(registry, "NonceChanged", [nonce])];
}

function targetValidatorsCountChanged(
  registry: NodeOperatorsRegistryContract,
  input: { nodeOperatorId: bigint; targetValidatorsCount: bigint; targetLimitMode: bigint; nonce: bigint },
): OmnibusCallEvent[] {
  return [
    event(registry, "TargetValidatorsCountChanged", [
      input.nodeOperatorId,
      input.targetValidatorsCount,
      input.targetLimitMode,
    ]),
    ...nonceChanged(registry, input.nonce),
  ];
}

export default { nameSet, rewardAddressSet, activeSet, targetValidatorsCountChanged };
