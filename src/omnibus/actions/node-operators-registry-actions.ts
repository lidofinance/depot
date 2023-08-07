import { ContractCallFactory } from "../types";

interface SetNodeOperatorNameOptions {
  id: number;
  name: string;
}

function setNodeOperatorName({ id, name }: SetNodeOperatorNameOptions): ContractCallFactory {
  return ({ addresses, contracts }) => ({
    address: addresses.nodeOperatorsRegistry,
    calldata: contracts.nodeOperatorsRegistry.interface.encodeFunctionData("setNodeOperatorName", [
      id,
      name,
    ]),
  });
}

interface SetNodeOperatorRewardAddressOptions {
  id: number;
  rewardAddress: string;
}

function setNodeOperatorRewardAddress({
  id,
  rewardAddress,
}: SetNodeOperatorRewardAddressOptions): ContractCallFactory {
  return ({ addresses, contracts }) => ({
    address: addresses.nodeOperatorsRegistry,
    calldata: contracts.nodeOperatorsRegistry.interface.encodeFunctionData(
      "setNodeOperatorRewardAddress",
      [id, rewardAddress],
    ),
  });
}

export default {
  setNodeOperatorName,
  setNodeOperatorRewardAddress,
};
