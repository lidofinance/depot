import { OmnibusAction, OmnibusTestContext, TitledEventChecks, TitledEvmCall } from "../omnibus";
import { call, event, forward } from "../../votes";

interface SetNodeOperatorNameInput {
  id: number;
  from: string;
  to: string;
}

export class SetNodeOperatorName extends OmnibusAction<SetNodeOperatorNameInput> {
  calls(): TitledEvmCall[] {
    const { id, from, to } = this.input;
    const { agent, curatedStakingModule } = this.contracts;
    return [
      [
        `Change the on-chain name of node operator with id ${id} from "${from}" to "${to}"`,
        forward(agent, [
          call(curatedStakingModule.setNodeOperatorName, [this.input.id, this.input.to]),
        ]),
      ],
    ];
  }
  events(): TitledEventChecks[] {
    const { curatedStakingModule } = this.contracts;
    return [
      [
        "Change node operator name",
        event(curatedStakingModule, "NodeOperatorNameSet", {
          args: [this.input.id, this.input.to],
        }),
      ],
    ];
  }

  async test({ it, assert }: OmnibusTestContext): Promise<void> {
    it("Name was set correctly", async () => {
      const nodeOperator = await this.contracts.curatedStakingModule.getNodeOperator(
        this.input.id,
        true,
      );
      assert.equal(nodeOperator.name, this.input.to);
    });
  }
}
