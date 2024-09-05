import { NetworkName } from "../networks";
import { FormattedEvmCall } from "../votes";
import actions from "./actions/actions";
import { OmnibusAction } from "./omnibus-action";
import lido, { LidoEthContracts } from "../lido";
import { flatten, mapValues, partial } from "lodash";

type BindNetwork<R extends Record<string, any>> = {
  [K in keyof R]: AppliedActionsRecord<R[K]>;
};
type AppliedActionsRecord<F extends (...args: any[]) => any> = (...args: OmitFirstParameter<F>) => ReturnType<F>;
type OmitFirstParameter<F> = F extends (arg0: any, ...rest: infer R) => any ? R : never;

type AppliedActions = {
  [K in keyof typeof actions]: BindNetwork<(typeof actions)[K]>;
};

interface Context<N extends NetworkName> {
  actions: AppliedActions;
  contracts: LidoEthContracts<N>;
}

export interface OmnibusPlan<N extends NetworkName> {
  items: (ctx: Context<N>) => (OmnibusAction | OmnibusAction[])[];
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
  quorumReached?: boolean;
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

function create<N extends NetworkName>(plan: OmnibusPlan<N>) {
  const appliedActions = mapValues(actions, (actions) =>
    mapValues(actions, (value) => partial(value, plan.network)),
  ) as AppliedActions;
  const items = flatten(
    plan.items({
      actions: appliedActions,
      contracts: lido.eth[plan.network] as LidoEthContracts<N>,
    }),
  );
  return {
    items,
    voteId: plan.voteId,
    network: plan.network,
    isLaunched: plan.voteId !== undefined,
    isExecuted: plan.executedOn !== undefined,
  };
}

export default {
  create,
};
