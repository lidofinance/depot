import { NetworkName } from "../networks";
import { EvmScriptParser, FormattedEvmCall } from "../votes";

import { OmnibusAction } from "./omnibus-action";

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
  actions: OmnibusAction[];
}

export class Omnibus<N extends NetworkName> {
  private readonly roadmap: OmnibusPlan<N>;
  private readonly _actions: OmnibusAction[] = [];

  constructor(roadmap: OmnibusPlan<N>) {
    this.roadmap = roadmap;
    this._actions = roadmap.actions;
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
    return this.actions.map((a) => a.evmCall);
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
  get actions() {
    return this._actions;
  }
}
