import { call, event, forward } from "../../votes";

import { OmnibusAction } from "../omnibus-action";
import { OmnibusTestContext } from "../tools/test";
import { OmnibusActionInput } from "../omnibus-action-meta";

interface SetNodeOperatorNameInput extends OmnibusActionInput {
  id: number;
  from: string;
  to: string;
}

export class SetNodeOperatorName extends OmnibusAction<SetNodeOperatorNameInput> {
  get title() {
    return this.input.title;
  }

  getCall() {
    const { agent, curatedStakingModule } = this.contracts;
    return forward(agent, [call(curatedStakingModule.setNodeOperatorName, [this.input.id, this.input.to])]);
  }

  getEvents() {
    const { curatedStakingModule } = this.contracts;
    return [
      event(curatedStakingModule, "NodeOperatorNameSet", {
        args: [this.input.id, this.input.to],
      }),
    ];
  }

  async after({ it, assert }: OmnibusTestContext): Promise<void> {
    it("Name was set correctly", async () => {
      const nodeOperator = await this.contracts.curatedStakingModule.getNodeOperator(this.input.id, true);
      assert.equal(nodeOperator.name, this.input.to);
    });
  }
}
