import { call, event, forward } from "../../votes";

import {
  OmnibusAction,
  OmnibusBeforeContext,
  OmnibusTestContext,
  TitledEventChecks,
  TitledEvmCall,
} from "../omnibus";

interface NewNodeOperatorInput {
  name: string;
  rewardAddress: Address;
}

interface AddNodeOperatorsInput {
  operators: NewNodeOperatorInput[];
}

interface AddNodeOperatorsState {
  nodeOperatorsCountBefore: number;
}

export class AddNodeOperators extends OmnibusAction<AddNodeOperatorsInput> {
  private state: AddNodeOperatorsState | null = null;

  private get curatedStakingModule() {
    return this.contracts.curatedStakingModule;
  }

  private get operators() {
    return this.input.operators;
  }

  calls(): TitledEvmCall[] {
    const res: TitledEvmCall[] = [];
    for (let { name, rewardAddress } of this.input.operators) {
      res.push([
        `Add node operator "${name}" with reward address ${rewardAddress}`,
        forward(this.contracts.agent, [
          call(this.curatedStakingModule.addNodeOperator, [name, rewardAddress]),
        ]),
      ]);
    }
    return res;
  }

  events(): TitledEventChecks[] {
    const res: TitledEventChecks[] = [];
    const {
      state,
      input: { operators },
      contracts: { agent, voting, callsScript, curatedStakingModule },
    } = this;

    if (!state) {
      throw new Error(`The state is empty. Seems like before() hook hasn't been called yet`);
    }

    const { nodeOperatorsCountBefore } = state;
    for (let i = 0; i < operators.length; ++i) {
      const { name, rewardAddress } = operators[i];
      const expectedNodeOperatorId = nodeOperatorsCountBefore + i;

      res.push([
        `Added node operator "${name}": id=${expectedNodeOperatorId}, rewardAddress=${rewardAddress}`,
        event(callsScript, "LogScriptCall", { emitter: voting }),
        event(callsScript, "LogScriptCall", { emitter: agent }),
        event(curatedStakingModule, "NodeOperatorAdded", {
          args: [expectedNodeOperatorId, name, rewardAddress, 0],
        }),
        event(agent, "ScriptResult"),
      ]);
    }

    return res;
  }

  async before({ assert }: OmnibusBeforeContext): Promise<void> {
    const { operators, curatedStakingModule } = this;
    const nodeOperatorsCountBefore = await curatedStakingModule.getNodeOperatorsCount();
    this.state = { nodeOperatorsCountBefore: +nodeOperatorsCountBefore.toString() };

    for (let i = 0; i < operators.length; ++i) {
      await assert.reverts(
        this.curatedStakingModule.getNodeOperator(nodeOperatorsCountBefore + BigInt(i), true),
        "OUT_OF_RANGE",
      );
    }
  }

  async test({ it, assert }: OmnibusTestContext) {
    const { state, operators, curatedStakingModule } = this;
    if (!state) {
      throw new Error("Snapshot was not taken");
    }
    it(`Validate node operators count changed correctly`, async () => {
      assert.equal(
        BigInt(state.nodeOperatorsCountBefore + operators.length),
        await curatedStakingModule.getNodeOperatorsCount(),
      );
    });

    for (let i = 0; i < operators.length; ++i) {
      const { name, rewardAddress } = operators[i];

      it(`Validate node operator "${name}" with reward address ${rewardAddress} was successfully added`, async () => {
        const operator = await this.curatedStakingModule.getNodeOperator(
          state.nodeOperatorsCountBefore + i,
          true,
        );
        assert.equal(operator.name, name);
      });
    }
  }
}
