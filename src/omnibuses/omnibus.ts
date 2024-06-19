import { flatten } from "lodash";

import { NetworkName } from "../networks";
import lido, { LidoEthContracts } from "../lido";
import votes, { EventCheck, EvmScriptParser, FormattedEvmCall } from "../votes";
import { RpcProvider, SignerWithAddress } from "../providers";

import { OmnibusItem } from "./omnibus-item";
import { OmnibusItemsGroup } from "./omnibus-items-group";

type DateString = string;

export type TitledEvmCall = [string, FormattedEvmCall];
export type TitledEventChecks = [string, ...EventCheck[]];

interface OmnibusPlan<N extends NetworkName> {
  /**
   Network where the omnibus must be launched. Supported networks: "mainnet", "holesky"
   */
  network: N;
  /**
   * When the omnibus was launched, contains the id of the vote
   */
  voteId?: number;
  /**
   * Contains the info about the omnibus execution:
   *  - date - the ISO DateTime string of the block.timestamp when the omnibus was launched
   *  - blockNumber - the number of the block with execution transaction
   */
  execution?: { date?: DateString | undefined; blockNumber?: number | undefined };
  /**
   * Contains the info about the omnibus launching
   * - date - required field, before the actual launch contains the ISO date of the expected
   *   launch date. After the launch contains the ISO DateTime string of the block.timestamp
   *   when the omnibus was launched.
   * - blockNumber - the number of the block where the omnibus was launched
   */
  launching: { date: DateString; blockNumber?: number | undefined };
  actions(contracts: LidoEthContracts<N>): (OmnibusItem<any> | OmnibusItemsGroup<any>)[];
}

export class Omnibus<N extends NetworkName> {
  private readonly roadmap: OmnibusPlan<N>;
  private readonly _actions: (OmnibusItem<any> | OmnibusItemsGroup<any>)[] = [];

  constructor(roadmap: OmnibusPlan<N>) {
    this.roadmap = roadmap;

    if (isNaN(this.launchingDate.valueOf())) {
      throw new Error(`Invalid launching date: "${this.roadmap.launching.date}"`);
    }

    if (this.executionDate && isNaN(this.executionDate.valueOf())) {
      throw new Error(`Invalid execution date: "${this.roadmap.execution?.date}"`);
    }
  }

  /**
   * When the vote was launched, returns the id of the vote. In the other case returns undefined.
   */
  public get voteId(): number | undefined {
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

  public get calls(): FormattedEvmCall[] {
    return flatten(this.actions.map((a) => (a instanceof OmnibusItem ? a.call : a.items.map((i) => i.call))));
  }

  public get titles(): string[] {
    return flatten(this.actions.map((a) => (a instanceof OmnibusItem ? a.title : a.items.map((i) => i.title))));
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

  private contracts(provider?: RpcProvider) {
    return lido.eth[this.network](provider) as LidoEthContracts<N>;
  }

  async init(provider: RpcProvider) {
    const contracts = this.contracts(provider);
    const actions = this.roadmap.actions(contracts);
    for (const action of actions) {
      await action.init(this.roadmap.network, contracts, provider);
      if (action instanceof OmnibusItemsGroup) {
        for (const item of action.items) {
          await item.init(this.roadmap.network, contracts, provider);
        }
      }
    }
    this._actions.push(...actions);
  }

  get actions(): (OmnibusItem<any> | OmnibusItemsGroup<any>)[] {
    return this._actions;
  }
}
