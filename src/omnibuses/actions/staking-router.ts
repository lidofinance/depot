import { BigNumberish } from "ethers";
import { StakingModule } from "../../lido/lido";
import { call, event, forward } from "../../votes";
import { Contracts } from "../../contracts/contracts";
import { Lido } from "../../../configs/types";
import { OmnibusAction } from "../omnibuses";
import { Address } from "../../common/types";

interface UpdateStakingModuleInput {
  title: string;
  stakingModuleId: StakingModule;
  targetShare: BigNumberish;
  treasuryFee: BigNumberish;
  stakingModuleFee: BigNumberish;
}

interface NewNodeOperatorInput {
  name: string;
  rewardAddress: Address;
}

interface AddNodeOperatorsInput {
  operators: NewNodeOperatorInput[];
}

function updateStakingModule(contracts: Contracts<Lido>, input: UpdateStakingModuleInput): OmnibusAction {
  const { callsScript, agent, voting, stakingRouter } = contracts;
  const { stakingModuleId, targetShare, stakingModuleFee, treasuryFee } = input;

  return {
    title: `Update "${StakingModule[stakingModuleId]}" staking module`,
    evmCall: forward(agent, [
      call(stakingRouter.updateStakingModule, [stakingModuleId, targetShare, stakingModuleFee, treasuryFee]),
    ]),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(stakingRouter, "StakingModuleTargetShareSet", {
        args: [stakingModuleId, targetShare, agent],
      }),
      event(stakingRouter, "StakingModuleFeesSet", {
        args: [stakingModuleId, stakingModuleFee, treasuryFee, agent],
      }),
      event(agent, "ScriptResult"),
    ],
  };
}

function addNodeOperators(contracts: Contracts<Lido>, input: AddNodeOperatorsInput): OmnibusAction {
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
    evmCall: forward(agent, calls),
    expectedEvents: [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      ...subItemEvents,
      event(agent, "ScriptResult"),
    ],
  };
}

export default {
  addNodeOperators,
  updateStakingModule,
};
