import type Mocha from "mocha";

import { assert } from "../common/assert";
import { NetworkName } from "../networks";
import { RpcProvider } from "../providers";
import { LidoEthContracts } from "../lido";
import { Contracts } from "../contracts/contracts";

export interface OmnibusActionInput {
  title?: string;
}

export interface MochaTest {
  (title: string, fn?: Mocha.Func | Mocha.AsyncFunc | undefined): void;
}

export interface OmnibusHookCtx {
  it: MochaTest;
  assert: typeof assert;
  provider: RpcProvider;
}

export abstract class OmnibusActionMeta<Input extends OmnibusActionInput> {
  private _network: NetworkName | null = null;
  private _contracts: LidoEthContracts | null = null;

  protected readonly input: Input;

  constructor(input: Input) {
    this.input = input;
  }

  get title(): string {
    if (this.input.title) {
      return this.input.title;
    }
    throw new Error(
      `Action ${this.constructor.name} failed. You should provide the title in the input or implement the title method by yourself.`,
    );
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

  /**
   * The hook launched before the vote with omnibus is submitted and executed.
   * May be used to check preconditions for the vote item
   * @param contracts
   */
  async before(contracts?: Contracts<any>): Promise<void> {}

  /**
   * The callback launched after the vote with omnibus is successfully executed.
   * May be used to test the effect of the action and validate the onchain state.
   * @param ctx {OmnibusHookCtx} - the context of the omnibus
   */
  async after(ctx: OmnibusHookCtx): Promise<void> {}
}
