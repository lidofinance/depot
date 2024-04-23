import chalk from 'chalk'
import Mocha, { Test } from 'mocha'
import { flatten } from 'lodash'
import { ContractTransactionReceipt, Log, TransactionReceipt } from 'ethers'

import { assert } from '../common/assert'
import { NetworkName } from '../networks'
import lido, { LidoEthContracts } from '../lido'
import { EvmScriptParser, FormattedEvmCall } from '../votes'
import votes, { EventCheck } from '../votes'
import { TxTrace } from '../traces/tx-traces'
import providers, { RpcProvider, SignerWithAddress, SnapshotRestorer } from '../providers'
import bytes from '../common/bytes'

import { OmnibusItem } from './omnibus-item'
import { OmnibusItemsGroup } from './omnibus-items-group'

type DateString = string

interface MochaTest {
  (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void
}

export interface OmnibusBeforeContext {
  assert: typeof assert
  provider: RpcProvider
}

export interface OmnibusTestContext {
  it: MochaTest
  assert: typeof assert
  provider: RpcProvider
}

export type TitledEvmCall = [string, FormattedEvmCall]
export type TitledEventChecks = [string, ...EventCheck[]]

interface OmnibusPlan<N extends NetworkName> {
  /**
   Network where the omnibus must be launched. Supported networks: "mainnet", "holesky"
   */
  network: N
  /**
   * When the omnibus was launched, contains the id of the vote
   */
  voteId?: number
  /**
   * Contains the info about the omnibus execution:
   *  - date - the ISO DateTime string of the block.timestamp when the omnibus was launched
   *  - blockNumber - the number of the block with execution transaction
   */
  execution?: { date?: DateString | undefined; blockNumber?: number | undefined }
  /**
   * Contains the info about the omnibus launching
   * - date - required field, before the actual launch contains the ISO date of the expected
   *   launch date. After the launch contains the ISO DateTime string of the block.timestamp
   *   when the omnibus was launched.
   * - blockNumber - the number of the block where the omnibus was launched
   */
  launching: { date: DateString; blockNumber?: number | undefined }
  actions(contracts: LidoEthContracts<N>): (OmnibusItem<any> | OmnibusItemsGroup<any>)[]
}

export interface SimulationGroup {
  call: FormattedEvmCall
  trace: TxTrace
  title: string
}

export class Omnibus<N extends NetworkName> {
  private readonly roadmap: OmnibusPlan<N>

  constructor(roadmap: OmnibusPlan<N>) {
    this.roadmap = roadmap

    if (isNaN(this.launchingDate.valueOf())) {
      throw new Error(`Invalid launching date: "${this.roadmap.launching.date}"`)
    }

    if (this.executionDate && isNaN(this.executionDate.valueOf())) {
      throw new Error(`Invalid execution date: "${this.roadmap.execution?.date}"`)
    }
  }

  /**
   * When the vote was launched, returns the id of the vote. In the other case returns undefined.
   */
  public get voteId(): number | undefined {
    return this.roadmap.voteId
  }

  public get network() {
    return this.roadmap.network
  }

  public get name(): string {
    return `${this.roadmap.launching.date}`
  }

  public get launchingDate() {
    return new Date(this.roadmap.launching.date)
  }

  public get launchingTimestamp(): number {
    return Math.round(+this.launchingDate / 1000)
  }

  public get launchingBlockNumber() {
    return this.roadmap.launching.blockNumber
  }

  public get executionDate() {
    return this.roadmap.execution?.date && new Date(this.roadmap.execution.date)
  }

  public get executionBlockNumber() {
    return this.roadmap.execution?.blockNumber
  }

  public get calls(): FormattedEvmCall[] {
    return flatten(this.actions().map((a) => (a instanceof OmnibusItem ? a.call : a.items.map((i) => i.call))))
  }

  public get titles(): string[] {
    return flatten(this.actions().map((a) => (a instanceof OmnibusItem ? a.title : a.items.map((i) => i.title))))
  }

  public get description(): string {
    return this.titles.map((title, index) => `${index + 1}. ${title}`).join('\n')
  }

  public get script(): string {
    return EvmScriptParser.encode(this.calls)
  }

  public get isLaunched(): boolean {
    return this.roadmap.launching.blockNumber !== undefined && this.roadmap.voteId !== undefined
  }

  public get isExecuted(): boolean {
    return this.isLaunched && this.roadmap.execution?.blockNumber !== undefined
  }

  public async launch(launcher: SignerWithAddress) {
    return votes.start(launcher, this.script, this.description, false)
  }

  public async simulate(provider: RpcProvider): Promise<[gasUsed: bigint, SimulationGroup[]]> {
    const snapshotRestorer = await providers.cheats(provider).snapshot()

    const { enactReceipt } = await votes.adopt(provider, this.script, this.description, {
      gasLimit: 30_000_000,
    })

    const voteTrace = await votes.trace(enactReceipt)

    const res: SimulationGroup[] = []

    const { calls, titles } = this

    let voteCallIndices: number[] = []
    for (let i = 0; i < this.calls.length; ++i) {
      const { address: contract, calldata } = calls[i]
      const startIndex = voteTrace.calls.findIndex(
        (opCode) =>
          (opCode.type === 'CALL' || opCode.type === 'DELEGATECALL') &&
          bytes.isEqual(opCode.address, contract) &&
          bytes.isEqual(opCode.input, calldata),
      )
      voteCallIndices.push(startIndex)
    }

    for (let ind = 0; ind < voteCallIndices.length; ++ind) {
      const traceStartInd = voteCallIndices[ind]
      const traceEndInd = voteCallIndices[ind + 1]
      const traceSlice = voteTrace.slice(traceStartInd, traceEndInd)
      res.push({
        title: titles[ind],
        trace: traceSlice,
        call: calls[ind],
      })
    }
    await snapshotRestorer.restore()

    return [enactReceipt.gasUsed, res]
  }

  public async test(provider: RpcProvider) {
    const actions = this.actions(provider)

    // preparing the mocha tests for omnibus
    const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true })

    const rootSuite = Mocha.Suite.create(
      mocha.suite,
      chalk.bold(`Testing the Omnibus "${this.name}" on ${this.network} network`),
    )

    const preparationSuite = Mocha.Suite.create(rootSuite, `Running before hooks & checks for the omnibus`)

    for (let action of actions) {
      const actionItemSuite = Mocha.Suite.create(preparationSuite, action.title)
      const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
        actionItemSuite.addTest(new Test(title, fn))
      }
      await action.before({ it, assert, provider })
    }

    const { snapshot } = providers.cheats(provider)
    let restorer: SnapshotRestorer | null = null

    const launchSuite = Mocha.Suite.create(rootSuite, `Launching & executing the omnibus (voteId = ${this.voteId})`)

    let enactReceipt: ContractTransactionReceipt | TransactionReceipt

    if (this.isLaunched) {
      launchSuite.addTest(
        new Test(`The omnibus already launched in voting ${this.voteId}. Executing the vote...`, async () => {
          if (!this.voteId) throw new Error(`voteId is not set`)
          enactReceipt = await votes.pass(provider, this.voteId)
          restorer = await snapshot()
        }),
      )
    } else {
      launchSuite.addTest(
        new Test(`Adopting the vote with omnibus...`, async () => {
          enactReceipt = await votes
            .adopt(provider, this.script, this.description, { gasLimit: 30_000_000 })
            .then((r) => r.enactReceipt)
          restorer = await snapshot()
        }),
      )
    }

    const voteItemsTestSuite = Mocha.Suite.create(rootSuite, `Validating the voting items`)
    launchSuite.afterAll(async () => {
      // testing the omnibus items one by one
      let eventsValidateFromIndex = 0
      let voteItemIndex = 0

      for (let i = 0; i < actions.length; ++i) {
        const action = actions[i]

        if (action instanceof OmnibusItem) {
          eventsValidateFromIndex = await this.createOmnibusItemTestSuite(
            voteItemsTestSuite,
            action,
            provider,
            voteItemIndex++,
            enactReceipt,
            eventsValidateFromIndex,
          )
        } else if (action instanceof OmnibusItemsGroup) {
          const items = action.items
          const itemGroupTestSuite = Mocha.Suite.create(voteItemsTestSuite, action.title)
          for (const item of items) {
            eventsValidateFromIndex = await this.createOmnibusItemTestSuite(
              voteItemsTestSuite,
              item,
              provider,
              voteItemIndex++,
              enactReceipt,
              eventsValidateFromIndex,
            )
          }
          const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
            itemGroupTestSuite.addTest(new Test(title, fn))
          }
          await action.after({ it, assert, provider })
        } else {
          throw new Error(`Unsupported omnibus item type ${action}`)
        }
      }
    })

    await new Promise((resolve, reject) => {
      mocha.run((failures) => {
        if (failures) reject('some tests failed')
        resolve('success')
      })
    })
  }

  private async createOmnibusItemTestSuite(
    parentSuite: Mocha.Suite,
    action: OmnibusItem<unknown>,
    provider: RpcProvider,
    voteItemIndex: number,
    enactReceipt: TransactionReceipt | ContractTransactionReceipt,
    eventsValidateFromIndex: number,
  ): Promise<number> {
    const actionTestsSuite = Mocha.Suite.create(parentSuite, `${++voteItemIndex}) ${action.title}`)
    const eventChecks = action.events
    const eventNames = eventChecks.map((e) => e.fragment.name).join(', ')
    actionTestsSuite.addTest(
      new Test(`Validate Events Sequence: [${eventNames}]`, () => {
        const foundSubsequence = votes.subsequence(enactReceipt.logs as Log[], eventChecks, eventsValidateFromIndex)

        if (foundSubsequence.length === 0) {
          throw new Error(`Empty events group "${name}"`)
        }

        if (foundSubsequence[foundSubsequence.length - 1] !== -1) {
          eventsValidateFromIndex = foundSubsequence[foundSubsequence.length - 1]
        }

        for (let i = 0; i < foundSubsequence.length; ++i) {
          const index = foundSubsequence[i]
          if (index !== -1) continue
          throw new Error(`Event not found ${eventChecks[i].fragment.name}`)
        }
      }),
    )

    // launch the omnibus item tests
    const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
      actionTestsSuite.addTest(new Test(title, fn))
    }
    await action.after({ it, assert, provider })
    return eventsValidateFromIndex
  }

  private contracts(provider?: RpcProvider) {
    return lido.eth[this.network](provider) as LidoEthContracts<N>
  }

  private actions(provider?: RpcProvider): (OmnibusItem<any> | OmnibusItemsGroup<any>)[] {
    const contracts = this.contracts(provider)
    const actions = this.roadmap.actions(contracts)
    actions.forEach((a) => {
      a.init(this.roadmap.network, contracts)
      if (a instanceof OmnibusItemsGroup) {
        a.items.forEach((a) => a.init(this.roadmap.network, contracts))
      }
    })
    return actions
  }
}
