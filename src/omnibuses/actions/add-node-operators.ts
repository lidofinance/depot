import { call, event, forward } from "../../votes";

import { Address } from "../../common/types";
import { LidoEthContracts } from "../../lido";

export interface NewNodeOperatorInput {
  name: string;
  rewardAddress: Address;
}

export interface AddNodeOperatorsInput {
  operators: NewNodeOperatorInput[];
}

export const AddNodeOperators = (contracts: LidoEthContracts<"mainnet">, input: AddNodeOperatorsInput) => {
  const { callsScript, curatedStakingModule, agent, voting } = contracts;
  const { operators } = input;

  const calls = operators.map((item) => {
    const { name, rewardAddress } = item;
    return call(curatedStakingModule.addNodeOperator, [name, rewardAddress]);
  });

  const subItemEvents = operators.flatMap((operator) => {
    const { name, rewardAddress } = operator;
    return [
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(curatedStakingModule, "NodeOperatorAdded", {
        args: [undefined, name, rewardAddress, 0],
      }),
    ];
  });

  return {
    title:
      `Add ${input.operators.length} node operators:\n` +
      input.operators.flatMap((item) => ` - ${item.name}`).join("\n"),
    EVMCalls: [forward(agent, calls)],
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      ...subItemEvents,
      event(agent, "ScriptResult"),
    ],
  };
};
