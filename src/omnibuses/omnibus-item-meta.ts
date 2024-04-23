import type Mocha from 'mocha'

import { assert } from '../common/assert'
import { NetworkName } from '../networks'
import { RpcProvider } from '../providers'
import { LidoEthContracts } from '../lido'

interface MochaTest {
  (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void
}

export interface OmnibusHookCtx {
  it: MochaTest
  assert: typeof assert
  provider: RpcProvider
}

export abstract class OmnibusItemMeta<Input = never> {
  private _network: NetworkName | null = null
  private _contracts: LidoEthContracts | null = null

  protected readonly input: Input

  constructor(input: Input) {
    this.input = input
  }

  get network() {
    if (!this._network) {
      throw new Error(`The context wasn't set`)
    }
    return this._network
  }

  get contracts() {
    if (!this._contracts) {
      throw new Error(`The context wasn't set`)
    }
    return this._contracts
  }

  init(network: NetworkName, contracts: LidoEthContracts) {
    this._network = network
    this._contracts = contracts
  }

  abstract get title(): string

  /**
   * The hook launched before the vote with omnibus is submitted and executed.
   * May be used to check preconditions for the vote item
   * @param ctx {OmnibusHookCtx} - the context of the omnibus
   */
  async before(ctx: OmnibusHookCtx): Promise<void> {}

  /**
   * The callback launched after the vote with omnibus is successfully executed.
   * May be used to test the effect of the action and validate the onchain state.
   * @param ctx {OmnibusHookCtx} - the context of the omnibus
   */
  async after(ctx: OmnibusHookCtx): Promise<void> {}
}
