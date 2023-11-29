import { Address } from "../../common/types";
import { OmnibusAction, OmnibusTestContext, TitledEventChecks, TitledEvmCall } from "../omnibus";
import { call, event, forward } from "../../votes";

interface SetNodeOperatorRewardAddressInput {
  id: number;
  from: Address;
  to: Address;
}

export class SetNodeOperatorRewardAddress extends OmnibusAction<SetNodeOperatorRewardAddressInput> {
  calls(): TitledEvmCall[] {
    const { id, from, to } = this.input;
    const { agent, curatedStakingModule } = this.contracts;
    return [
      [
        `Change the reward address of node operator with id ${id} from ${from} to ${to}`,
        forward(agent, [
          call(curatedStakingModule.setNodeOperatorRewardAddress, [this.input.id, this.input.to]),
        ]),
      ],
    ];
  }
  events(): TitledEventChecks[] {
    const { curatedStakingModule } = this.contracts;
    return [
      [
        "Change node operator reward address",
        event(curatedStakingModule, "NodeOperatorRewardAddressSet", {
          args: [this.input.id, this.input.to],
        }),
      ],
    ];
  }

  async test({ it, assert }: OmnibusTestContext): Promise<void> {
    it("Reward address was set correctly", async () => {
      const nodeOperator = await this.contracts.curatedStakingModule.getNodeOperator(
        this.input.id,
        true,
      );
      assert.equal(nodeOperator.rewardAddress, this.input.to);
    });
  }
}
