import { NetworkName } from "../networks";
import { EventCheck, EvmScriptParser, FormattedEvmCall } from "../votes";
import blueprints from "./blueprints";
import lido, { LidoEthContracts } from "../lido";
import { flatten, mapValues, partial } from "lodash";

export type BindFirstParam<R extends Record<string, any>> = {
  [K in keyof R]: BoundRecord<R[K]>;
};
type BoundRecord<F extends (...args: any[]) => any> = (...args: OmitFirstParameter<F>) => ReturnType<F>;
type OmitFirstParameter<F> = F extends (arg0: any, ...rest: infer R) => any ? R : never;

type BoundBlueprints = {
  [K in keyof typeof blueprints]: BindFirstParam<(typeof blueprints)[K]>;
};

interface Context<N extends NetworkName> {
  blueprints: BoundBlueprints;
  contracts: LidoEthContracts<N>;
}

export interface OmnibusPlan<N extends NetworkName> {
  items: (ctx: Context<N>) => (OmnibusItem | OmnibusItem[])[];
  /**
   Network where the omnibus must be launched. Supported networks: "mainnet", "holesky".
   */
  network: N;
  /**
    Description will be uploaded to IPFS and CID (IPFS address) will be added to vote metadata
   */
  description: string;
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
  quorumReached?: boolean;
  /**
   * Contains the info about the omnibus execution - the number of the block with execution transaction.
   */
  executedOn?: number | undefined;
}

export interface Omnibus {
  network: NetworkName;
  description: string;
  summary: string;
  calls: FormattedEvmCall[];
  script: string;
  voteId?: number;
  isLaunched: boolean;
  isExecuted: boolean;
  items: OmnibusItem[]; // for event checking purpose
}

export interface OmnibusItem {
  title: string;
  evmCall: FormattedEvmCall;
  expectedEvents: EventCheck[];
}

function create<N extends NetworkName>(plan: OmnibusPlan<N>): Omnibus {
  const contracts = lido.eth[plan.network]() as LidoEthContracts<N>;
  const boundBlueprints = mapValues(blueprints, (blueprints) =>
    mapValues(blueprints, (value) => partial(value, contracts)),
  ) as BoundBlueprints;
  const items = flatten(plan.items({ blueprints: boundBlueprints, contracts }));

  return {
    voteId: plan.voteId,
    network: plan.network,
    description: plan.description,
    isLaunched: plan.voteId !== undefined,
    isExecuted: plan.executedOn !== undefined,
    items: items,
    summary: items.map((item, index) => `${index + 1}. ${item.title}`).join("\n"),
    calls: items.map((item) => item.evmCall),
    script: EvmScriptParser.encode(items.map((item) => item.evmCall)),
  };
}

export default {
  create,
};
