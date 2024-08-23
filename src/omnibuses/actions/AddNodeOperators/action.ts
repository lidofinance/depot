import { call, event, FormattedEvmCall, forward } from "../../../votes";
import { OmnibusAction } from "../../omnibus-action";
import { Address } from "../../../common/types";
import { OmnibusActionInput } from "../../omnibus-action-meta";
import { ActionTestContext } from "../../../testing/contracts";

export interface NewNodeOperatorInput {
  name: string;
  rewardAddress: Address;
}

interface AddNodeOperatorsInput extends OmnibusActionInput {
  operators: NewNodeOperatorInput[];
}

class AddNodeOperatorsClass extends OmnibusAction<AddNodeOperatorsInput> {
  get title(): string {
    return (
      `Add ${this.input.operators.length} node operators:\n` +
      this.input.operators.flatMap((item) => ` - ${item.name}`).join("\n")
    );
  }

  getEVMCalls(): FormattedEvmCall[] {
    const calls = this.input.operators.map((item) => {
      const { name, rewardAddress } = item;
      const { curatedStakingModule } = this.contracts;
      return call(curatedStakingModule.addNodeOperator, [name, rewardAddress]);
    });
    return [forward(this.contracts.agent, calls)];
  }

  getExpectedEvents() {
    const { callsScript, curatedStakingModule, agent, voting } = this.contracts;
    const subItemEvents = this.input.operators.flatMap((item) => {
      const { name, rewardAddress } = item;
      return [
        event(callsScript, "LogScriptCall", { emitter: agent }),
        event(curatedStakingModule, "NodeOperatorAdded", {
          args: [undefined, name, rewardAddress, 0],
        }),
      ];
    });

    return [
      event(callsScript, "LogScriptCall", { emitter: voting }),
      ...subItemEvents,
      event(agent, "ScriptResult"),
      event(voting, "ScriptResult"),
      event(voting, "ExecuteVote"),
    ];
  }

  async getTestContext(): Promise<ActionTestContext> {
    return {
      imports: ['import { NewNodeOperatorInput } from "../src/omnibuses/actions";'],
      globalValues: { newNopCount: this.input.operators.length },
      localValues: ["nodeOperatorsBefore"],
      beforePreps: ["nodeOperatorsBefore = await contracts.curatedStakingModule.getNodeOperatorsCount();"],
      testSuites: [testSuite],
    };
  }
}

export const AddNodeOperators = (input: AddNodeOperatorsInput) => new AddNodeOperatorsClass(input);

const testSuite = `
describe("AddNodeOperators", () => {
    it(\`node operators count was increased by \${newNopCount}\`, async () => {
      const expectedNodeOperatorsCount = nodeOperatorsBefore + BigInt(newNopCount);
      const nodeOperatorsCount = await contracts.curatedStakingModule.getNodeOperatorsCount();

      assert.equal(nodeOperatorsCount, expectedNodeOperatorsCount);
    });

    const operators = omnibus.actions[2]["input"].operators;
    operators.forEach((operator: NewNodeOperatorInput, idx: number) => {
      it(\`operator \${operator.name} was added\`, async () => {
        const { name, rewardAddress } = operator;
        const nopID = nodeOperatorsBefore + BigInt(idx);
        const nopInfo = await contracts.curatedStakingModule.getNodeOperator(nopID, false);

        assert.equal(nopInfo.rewardAddress, rewardAddress, \`Operator \${name} not found\`);
      });
    });
  });
`;
