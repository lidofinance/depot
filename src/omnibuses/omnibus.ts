import { NetworkName } from "../networks";
import lido, { LidoEthContracts } from "../lido";
import votes, { EventCheck, EvmScriptParser, FormattedEvmCall } from "../votes";
import { RpcProvider, SignerWithAddress } from "../providers";

import { OmnibusAction } from "./omnibus-action";

export type TitledEvmCall = [string, FormattedEvmCall];
export type TitledEventChecks = [string, ...EventCheck[]];

interface OmnibusPlan<N extends NetworkName> {
  /**
   Network where the omnibus must be launched. Supported networks: "mainnet", "holesky".
   */
  network: N;
  /**
   * When the omnibus was launched, contains the id of the vote.
   */
  voteId?: number;
  /**
   * Contains the info about the omnibus launching - the number of the block where the omnibus was launched.
   */
  launchedOn?: number | undefined;
  /**
   * Contains the info about the omnibus quorum - was it reached during the vote or not.
   */
  quorumReached: boolean;
  /**
   * Contains the info about the omnibus execution - the number of the block with execution transaction.
   */
  executedOn?: number | undefined;
  actions(contracts: LidoEthContracts<N>): OmnibusAction<any>[];
}

export class Omnibus<N extends NetworkName> {
  private readonly roadmap: OmnibusPlan<N>;
  private readonly _actions: OmnibusAction<any>[] = [];

  constructor(roadmap: OmnibusPlan<N>) {
    this.roadmap = roadmap;
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
    return `${this.roadmap.voteId}`;
  }

  public get calls(): FormattedEvmCall[] {
    return this.actions.flatMap((a) => a.getEVMCalls());
  }

  public get titles(): string[] {
    return this.actions.map((a) => a.title);
  }

  public get description(): string {
    return this.titles.map((title, index) => `${index + 1}. ${title}`).join("\n");
  }

  public get script(): string {
    return EvmScriptParser.encode(this.calls);
  }

  public get isLaunched(): boolean {
    return this.roadmap.launchedOn !== undefined && this.roadmap.voteId !== undefined;
  }

  public get isExecuted(): boolean {
    return this.isLaunched && this.roadmap.executedOn !== undefined;
  }

  public async launch(launcher: SignerWithAddress) {
    return votes.start(launcher, this.script, this.description, false);
  }

  private contracts(provider?: RpcProvider) {
    return lido.eth[this.network](provider) as LidoEthContracts<N>;
  }

  init(provider: RpcProvider) {
    const contracts = this.contracts(provider);
    const actions = this.roadmap.actions(contracts);
    actions.forEach((action) => {
      action.init(this.roadmap.network, contracts);
      this._actions.push(action);
    });
  }

  get actions() {
    return this._actions;
  }
}
