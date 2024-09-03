import { NetworkName } from "../networks";
import { EvmScriptParser, FormattedEvmCall } from "../votes";

import { OmnibusAction } from "./omnibus-action";

export interface OmnibusPlan<N extends NetworkName> {
  actions: OmnibusAction[];
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
}

export interface Omnibus {
  network: NetworkName;
  summary: string;
  calls: FormattedEvmCall[];
  script: string;
  voteId?: number;
  isLaunched: boolean;
  isExecuted: boolean;
  actions: OmnibusAction[]; // for event checking purposes
}

export const makeOmnibus = (plan: OmnibusPlan<any>): Omnibus => {
  return {
    network: plan.network,
    summary: plan.actions.map((action, index) => `${index + 1}. ${action.title}`).join("\n"),
    calls: plan.actions.map((a) => a.evmCall),
    script: EvmScriptParser.encode(plan.actions.map((a) => a.evmCall)),
    voteId: plan.voteId,
    isLaunched: plan.voteId !== undefined,
    isExecuted: plan.executedOn !== undefined,
    actions: plan.actions,
  };
};
