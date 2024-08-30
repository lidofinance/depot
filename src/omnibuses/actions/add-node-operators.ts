import { call, event, EventCheck, FormattedEvmCall, forward } from "../../votes";

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

  return {
    title:
      `Add ${input.operators.length} node operators:\n` +
      input.operators.flatMap((item) => ` - ${item.name}`).join("\n"),
    getEVMCalls(): FormattedEvmCall[] {
      const calls = operators.map((item) => {
        const { name, rewardAddress } = item;
        return call(curatedStakingModule.addNodeOperator, [name, rewardAddress]);
      });
      return [forward(agent, calls)];
    },
    getExpectedEvents(): EventCheck[] {
      const subItemEvents = operators.flatMap((operator) => {
        const { name, rewardAddress } = operator;
        return [
          event(callsScript, "LogScriptCall", { emitter: agent }),
          event(curatedStakingModule, "NodeOperatorAdded", {
            args: [undefined, name, rewardAddress, 0],
          }),
        ];
      });

      return [event(callsScript, "LogScriptCall", { emitter: voting }), ...subItemEvents, event(agent, "ScriptResult")];
    },
  };
};
