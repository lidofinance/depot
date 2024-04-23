import { OmnibusTestContext, TitledEventChecks, TitledEvmCall } from '../omnibus'
import { FormattedEvmCall, call, event, forward } from '../../votes'

import { OmnibusItem, OmnibusHookCtx } from '../omnibus-item'

interface SetNodeOperatorNameInput {
  id: number
  from: string
  to: string
}

export class SetNodeOperatorName extends OmnibusItem<SetNodeOperatorNameInput> {
  get title() {
    const { id, from, to } = this.input
    return `Change the on-chain name of node operator with id ${id} from "${from}" to "${to}"`
  }

  get call() {
    const { agent, curatedStakingModule } = this.contracts
    return forward(agent, [call(curatedStakingModule.setNodeOperatorName, [this.input.id, this.input.to])])
  }

  get events() {
    const { curatedStakingModule } = this.contracts
    return [
      event(curatedStakingModule, 'NodeOperatorNameSet', {
        args: [this.input.id, this.input.to],
      }),
    ]
  }

  async after({ it, assert }: OmnibusTestContext): Promise<void> {
    it('Name was set correctly', async () => {
      const nodeOperator = await this.contracts.curatedStakingModule.getNodeOperator(this.input.id, true)
      assert.equal(nodeOperator.name, this.input.to)
    })
  }
}
