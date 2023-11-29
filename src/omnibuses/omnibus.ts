import chalk from "chalk";
import Mocha, { Test } from "mocha";
import { flatten } from "lodash";
import { ContractTransactionReceipt, Log, TransactionReceipt } from "ethers";

import { assert } from "../common/assert";
import { NetworkName } from "../networks";
import lido, { LidoEthContracts } from "../lido";
import { EvmScriptParser, FormattedEvmCall } from "../votes";
import votes, { EventCheck } from "../votes";
import { TxCallTrace } from "../traces/tx-call-trace";
import providers, { RpcProvider, SignerWithAddress, SnapshotRestorer } from "../providers";
import bytes from "../common/bytes";

interface MochaTest {
  (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void;
}

export interface OmnibusBeforeContext {
  assert: typeof assert;
  provider: RpcProvider;
}

export interface OmnibusTestContext {
  it: MochaTest;
  assert: typeof assert;
  provider: RpcProvider;
}

export type TitledEvmCall = [string, FormattedEvmCall];
export type TitledEventChecks = [string, ...EventCheck[]];

export abstract class OmnibusAction<Input = never> {
  protected readonly input: Input;
  protected _network: NetworkName | null = null;
  protected _contracts: LidoEthContracts | null = null;

  constructor(input: Input) {
    this.input = input;
  }

  get network() {
    if (!this._network) {
      throw new Error(`The context wasn't set`);
    }
    return this._network;
  }

  get contracts() {
    if (!this._contracts) {
      throw new Error(`The context wasn't set`);
    }
    return this._contracts;
  }

  init(network: NetworkName, contracts: LidoEthContracts) {
    this._network = network;
    this._contracts = contracts;
  }

  async before(ctx: OmnibusBeforeContext): Promise<void> {}

  abstract calls(): TitledEvmCall[];
  abstract events(): TitledEventChecks[];
  abstract test(ctx: OmnibusTestContext): Promise<void>;
}

type DateString = string;

interface OmnibusPlan<N extends NetworkName> {
  network: N;
  voteId?: number;
  execution?: { date?: DateString | undefined; blockNumber?: number | undefined };
  launching: { date: DateString; blockNumber?: number | undefined };
  actions(contracts: LidoEthContracts<N>): OmnibusAction<any>[];
}

export interface SimulationGroup {
  call: FormattedEvmCall;
  trace: TxCallTrace;
  title: string;
}

export class Omnibus<N extends NetworkName> {
  private readonly roadmap: OmnibusPlan<N>;

  constructor(roadmap: OmnibusPlan<N>) {
    this.roadmap = roadmap;

    if (isNaN(this.launchingDate.valueOf())) {
      throw new Error(`Invalid launching date: "${this.roadmap.launching.date}"`);
    }

    if (this.executionDate && isNaN(this.executionDate.valueOf())) {
      throw new Error(`Invalid execution date: "${this.roadmap.execution?.date}"`);
    }
  }

  public get voteId() {
    return this.roadmap.voteId;
  }

  public get network() {
    return this.roadmap.network;
  }

  public get name(): string {
    return `${this.roadmap.launching.date}`;
  }

  public get launchingDate() {
    return new Date(this.roadmap.launching.date);
  }

  public get launchingTimestamp(): number {
    return Math.round(+this.launchingDate / 1000);
  }

  public get launchingBlockNumber() {
    return this.roadmap.launching.blockNumber;
  }

  public get executionDate() {
    return this.roadmap.execution?.date && new Date(this.roadmap.execution.date);
  }

  public get executionBlockNumber() {
    return this.roadmap.execution?.blockNumber;
  }

  public get entries(): TitledEvmCall[] {
    return flatten(this.actions().map((action) => action.calls()));
  }

  public get calls(): FormattedEvmCall[] {
    return this.entries.map(([, call]) => call);
  }

  public get titles(): string[] {
    return this.entries.map(([title]) => title);
  }

  public get description(): string {
    return this.titles.map((title, index) => `${index + 1}. ${title}`).join("\n");
  }

  public get script(): string {
    return EvmScriptParser.encode(this.calls);
  }

  public get isLaunched(): boolean {
    return this.roadmap.launching.blockNumber !== undefined && this.roadmap.voteId !== undefined;
  }

  public get isExecuted(): boolean {
    return this.isLaunched && this.roadmap.execution?.blockNumber !== undefined;
  }

  public async launch(launcher: SignerWithAddress) {
    return votes.start(launcher, this.script, this.description, false);
  }

  public async simulate(provider: RpcProvider): Promise<[gasUsed: bigint, SimulationGroup[]]> {
    const snapshotRestorer = await providers.cheats(provider).snapshot();

    const { enactReceipt } = await votes.adopt(provider, this.script, this.description);

    const voteTrace = await votes.trace(enactReceipt);

    const res: SimulationGroup[] = [];

    const { calls, titles } = this;

    let voteCallIndices: number[] = [];
    for (let i = 0; i < this.calls.length; ++i) {
      const { address: contract, calldata } = calls[i];
      const startIndex = voteTrace.calls.findIndex(
        (opCode) =>
          (opCode.type === "CALL" || opCode.type === "DELEGATECALL") &&
          bytes.isEqual(opCode.to, contract) &&
          bytes.isEqual(opCode.input, calldata),
      );
      voteCallIndices.push(startIndex);
    }

    for (let ind = 0; ind < voteCallIndices.length; ++ind) {
      const traceStartInd = voteCallIndices[ind];
      const traceEndInd = voteCallIndices[ind + 1];
      const traceSlice = voteTrace.slice(traceStartInd, traceEndInd);
      res.push({
        title: titles[ind],
        trace: traceSlice,
        call: calls[ind],
      });
    }
    await snapshotRestorer.restore();

    return [enactReceipt.gasUsed, res];
  }

  public async test(provider: RpcProvider) {
    const actions = this.actions(provider);

    // preparing the mocha tests for omnibus
    const mocha = new Mocha({ timeout: 10 * 60 * 1000, bail: true });

    const rootSuite = Mocha.Suite.create(
      mocha.suite,
      chalk.bold(`Testing the Omnibus "${this.name}" on ${this.network} network`),
    );

    // here we want prepare everything for the future tests

    const { snapshot } = providers.cheats(provider);

    let restorer: SnapshotRestorer | null = null;

    const preparationSuite = Mocha.Suite.create(
      rootSuite,
      `Running before hooks & checks for the omnibus`,
    );

    preparationSuite.addTest(
      new Test(`Everything is ready for test-launch`, async () => {
        for (let action of actions) {
          await action.before({ assert, provider });
        }
      }),
    );

    const launchSuite = Mocha.Suite.create(
      rootSuite,
      `Launching & executing the omnibus (voteId = ${this.voteId})`,
    );

    let enactReceipt: ContractTransactionReceipt | TransactionReceipt;

    if (this.isLaunched) {
      launchSuite.addTest(
        new Test(
          `The omnibus already launched in voting ${this.voteId}. Executing the vote...`,
          async () => {
            if (!this.voteId) throw new Error(`voteId is not set`);
            enactReceipt = await votes.pass(provider, this.voteId);
            restorer = await snapshot();
          },
        ),
      );
    } else {
      launchSuite.addTest(
        new Test(`Adopting the vote with omnibus...`, async () => {
          enactReceipt = await votes
            .adopt(provider, this.script, this.description)
            .then((r) => r.enactReceipt);
          restorer = await snapshot();
        }),
      );
    }

    const eventsSuite = Mocha.Suite.create(
      rootSuite,
      `Validating the correct events chain was emitted`,
    );
    // we can't create events tests before we actually launched the omnibus
    // so create events chain tests just after the omnibus was adopted
    launchSuite.afterAll(() => {
      let eventsValidateFromIndex = 0;
      for (let i = 0; i < actions.length; ++i) {
        const action = actions[i];
        const actionEventsSuite = Mocha.Suite.create(eventsSuite, action.constructor.name);

        for (const [name, ...eventChecks] of action.events()) {
          actionEventsSuite.addTest(
            new Test(name, () => {
              const foundSubsequence = votes.subsequence(
                enactReceipt.logs as Log[],
                eventChecks,
                eventsValidateFromIndex,
              );

              if (foundSubsequence.length === 0) {
                throw new Error(`Empty events group "${name}"`);
              }

              if (foundSubsequence[foundSubsequence.length - 1] !== -1) {
                eventsValidateFromIndex = foundSubsequence[foundSubsequence.length - 1];
              }

              for (let index of foundSubsequence) {
                if (index !== -1) continue;
                throw new Error(`Event not found`);
              }
            }),
          );
        }
      }
    });

    const testsTestSuite = Mocha.Suite.create(rootSuite, `Running actions tests`);
    eventsSuite.afterAll(async () => {
      for (let i = 0; i < actions.length; ++i) {
        const action = actions[i];
        const actionTestsSuite = Mocha.Suite.create(testsTestSuite, action.constructor.name);
        const it = (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void => {
          actionTestsSuite.addTest(new Test(title, fn));
        };
        await action.test({ it, assert, provider });
      }
    });

    testsTestSuite.afterEach(async () => {
      restorer?.restore();
    });

    await new Promise((resolve, reject) => {
      mocha.run((failures) => {
        if (failures) reject("some tests failed");
        resolve("success");
      });
    });
  }

  private contracts(provider?: RpcProvider) {
    return lido.eth[this.network](provider) as LidoEthContracts<N>;
  }

  private actions(provider?: RpcProvider): OmnibusAction<any>[] {
    const contracts = this.contracts(provider);
    const actions = this.roadmap.actions(contracts);
    actions.forEach((a) => a.init(this.roadmap.network, contracts));
    return actions;
  }
}
