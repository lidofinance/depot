import { Address } from '../../common/types'
import { FormattedEvmCall, call, event, forward } from '../../votes'

import { OmnibusItem, OmnibusHookCtx } from '../omnibus-item'

interface SetNodeOperatorRewardAddressInput {
  id: number
  from: Address
  to: Address
}

export class SetNodeOperatorRewardAddress extends OmnibusItem<SetNodeOperatorRewardAddressInput> {
  get title(): string {
    const { id, from, to } = this.input
    return `Change the reward address of node operator with id ${id} from ${from} to ${to}`
  }

  get call(): FormattedEvmCall {
    const { agent, curatedStakingModule } = this.contracts
    return forward(agent, [call(curatedStakingModule.setNodeOperatorRewardAddress, [this.input.id, this.input.to])])
  }

  get events() {
    const { curatedStakingModule } = this.contracts
    return [
      event(curatedStakingModule, 'NodeOperatorRewardAddressSet', {
        args: [this.input.id, this.input.to],
      }),
    ]
  }

  async after({ it, assert }: OmnibusHookCtx): Promise<void> {
    it('Reward address was set correctly', async () => {
      const nodeOperator = await this.contracts.curatedStakingModule.getNodeOperator(this.input.id, true)
      assert.equal(nodeOperator.rewardAddress, this.input.to)
    })
  }
}
