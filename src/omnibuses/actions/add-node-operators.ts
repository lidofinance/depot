import { call, event, forward } from "../../votes";

import { OmnibusAction, OmnibusHookCtx } from "../omnibus-action";
import { OmnibusActionGroup } from "../omnibus-action-group";
import { Address } from "../../common/types";

interface NewNodeOperatorInput {
  name: string;
  rewardAddress: Address;
}

interface AddNodeOperatorsInput {
  nodeOperatorsCountBefore: number;
  operators: NewNodeOperatorInput[];
}

interface AddNodeOperatorItemInput extends NewNodeOperatorInput {
  expectedNodeOperatorId: number;
}

export class AddNodeOperators extends OmnibusActionGroup<AddNodeOperatorsInput> {
  public readonly items: AddNodeOperatorItem[];
  public readonly title = "Add the list of node operators to curated staking module";

  constructor(input: AddNodeOperatorsInput) {
    super(input);
    this.items = input.operators.map(
      (i, index) =>
        new AddNodeOperatorItem({
          ...i,
          expectedNodeOperatorId: input.nodeOperatorsCountBefore + index,
        }),
    );
  }

  async before({ it, assert }: OmnibusHookCtx): Promise<void> {
    const { curatedStakingModule } = this.contracts;
    const { operators, nodeOperatorsCountBefore } = this.input;

    it("Expected node operators count is correct", async () => {
      const nodeOperatorsCount = await curatedStakingModule.getNodeOperatorsCount();
      assert.equal(nodeOperatorsCountBefore, +nodeOperatorsCount.toString());
    });

    it("Expected node operator ids are not registered", async () => {
      for (let i = 0; i < operators.length; ++i) {
        await assert.reverts(curatedStakingModule.getNodeOperator(nodeOperatorsCountBefore + i, true), "OUT_OF_RANGE");
      }
    });
  }

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    it("Validate node operators count changed correctly", async () => {
      const { curatedStakingModule } = this.contracts;
      const { nodeOperatorsCountBefore, operators } = this.input;
      assert.equal(
        BigInt(nodeOperatorsCountBefore + operators.length),
        await curatedStakingModule.getNodeOperatorsCount(),
      );
    });
  }
}

class AddNodeOperatorItem extends OmnibusAction<AddNodeOperatorItemInput> {
  get title() {
    const { name, rewardAddress } = this.input;
    return `Add node operator "${name}" with reward address ${rewardAddress}`;
  }

  get call() {
    const { name, rewardAddress } = this.input;
    const { curatedStakingModule } = this.contracts;
    return forward(this.contracts.agent, [call(curatedStakingModule.addNodeOperator, [name, rewardAddress])]);
  }

  get events() {
    const { name, rewardAddress, expectedNodeOperatorId } = this.input;
    const { agent, voting, callsScript, curatedStakingModule } = this.contracts;
    return [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      event(callsScript, "LogScriptCall", { emitter: agent }),
      event(curatedStakingModule, "NodeOperatorAdded", {
        args: [expectedNodeOperatorId, name, rewardAddress, 0],
      }),
      event(agent, "ScriptResult"),
    ];
  }

  async after({ it, assert }: OmnibusHookCtx) {
    const { name, expectedNodeOperatorId } = this.input;
    const { curatedStakingModule } = this.contracts;

    it(`Validate node operator was added successfully`, async () => {
      const operator = await curatedStakingModule.getNodeOperator(expectedNodeOperatorId, true);
      assert.equal(operator.name, name);
    });
  }
}
