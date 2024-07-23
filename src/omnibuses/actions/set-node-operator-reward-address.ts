import { Address } from "../../common/types";
import { FormattedEvmCall, call, event, forward } from "../../votes";

import { OmnibusAction, OmnibusHookCtx } from "../omnibus-action";
import { OmnibusActionInput } from "../omnibus-action-meta";

interface SetNodeOperatorRewardAddressInput extends OmnibusActionInput {
  id: number;
  from: Address;
  to: Address;
}

export class SetNodeOperatorRewardAddress extends OmnibusAction<SetNodeOperatorRewardAddressInput> {
  get title(): string {
    return this.input.title;
  }

  getEVMCall(): FormattedEvmCall {
    const { agent, curatedStakingModule } = this.contracts;
    return forward(agent, [call(curatedStakingModule.setNodeOperatorRewardAddress, [this.input.id, this.input.to])]);
  }

  getExpectedEvents() {
    const { curatedStakingModule } = this.contracts;
    return [
      event(curatedStakingModule, "NodeOperatorRewardAddressSet", {
        args: [this.input.id, this.input.to],
      }),
    ];
  }

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    it("Reward address was set correctly", async () => {
      const nodeOperator = await this.contracts.curatedStakingModule.getNodeOperator(this.input.id, true);
      assert.equal(nodeOperator.rewardAddress, this.input.to);
    });
  }
}
