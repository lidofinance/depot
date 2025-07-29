import { Address, ExtractAbiFunctionNames } from "abitype";
import {
  Contract,
  getEventAbi,
  getLidoContracts,
  getLidoImpls,
  getLidoProxies,
  LidoContracts,
  LidoImpls,
  LidoProxies,
} from "../../contracts/contracts";
import { NetworkName } from "../../network";
import blueprints from "../blueprints";
import { ContractEvent, Omnibus, OmnibusCall } from "../omnibus";
import { FilterAbiEvents, FindEventAbiParams, FindFunctionAbiParams } from "../../types/abi.types";
import { OmnibusForwardCall } from "../calls/omnibus-forward-call";
import { OmnibusSubmitProposalCall } from "../calls/omnibus-submit-proposal-call";
import { Agent_ABI } from "../../../abi/Agent.abi";
import { OmnibusExecuteCall } from "../calls/omnibus-execute-call";
import { OmnibusDirectCall } from "../calls/omnibus-direct-call";
import { OmnibusTestFn } from "./test-omnibus";

type BindFirstParam<R extends Record<string, (...args: any[]) => any>> = {
  [K in keyof R]: R[K] extends (first: any, ...rest: infer Args) => infer Return ? (...args: Args) => Return : never;
};

type BoundBlueprints = {
  [K in keyof typeof blueprints]: BindFirstParam<(typeof blueprints)[K]>;
};

export interface OmniScriptCtx<N extends NetworkName = NetworkName> {
  impls: LidoImpls<N>;
  proxies: LidoProxies<N>;
  contracts: LidoContracts<N>;

  // The voting will be bound to the method at the construction of the omnibus
  call: ReturnType<typeof createCall>;
  event: typeof event;
  forward: ReturnType<typeof createForward>;
  execute: ReturnType<typeof createExecute>;
  submitProposal: ReturnType<typeof createSubmitProposal>;
  blueprints: BoundBlueprints;
}

export interface OmnibusPlan<N extends NetworkName> {
  network: N;
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
  calls: (ctx: OmniScriptCtx<N>) => OmnibusCall[];
  test: OmnibusTestFn<N>;
}

type HasForwardMethod<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends {
      readonly name: "forward";
      readonly type: "function";
      readonly inputs: readonly [{ readonly name: "_evmScript"; readonly type: "bytes" }, ...any[]];
      readonly stateMutability: "nonpayable";
    }
    ? true
    : HasForwardMethod<Tail>
  : false;

type HasSubmitProposal<T extends readonly unknown[]> =
  Extract<T[number], { readonly name: "submitProposal"; readonly type: "function" }> extends never ? false : true;

type PartialArray<T extends unknown[]> = T extends readonly [infer A, ...infer Tail]
  ? [A | null, ...PartialArray<Tail>]
  : T extends []
    ? []
    : never;

export type BlueprintCtx<N extends NetworkName = NetworkName> = Omit<OmniScriptCtx<N>, "blueprints">;

export function createOmnibus<N extends NetworkName>({
  network,
  calls: items,
  test,
  ...meta
}: OmnibusPlan<N>): Omnibus<N> {
  const contracts = getLidoContracts(network);

  const blueprintCtx: BlueprintCtx<N> = {
    contracts,
    proxies: getLidoProxies(network),
    impls: getLidoImpls(network),
    event,
    call: createCall(contracts),
    forward: createForward(contracts),
    execute: createExecute(),
    submitProposal: createSubmitProposal(contracts),
  };

  const blueprintsBound: any = {};
  for (const [blueprintNamespace, blueprintMethods] of Object.entries(blueprints)) {
    blueprintsBound[blueprintNamespace] = {};
    for (const [blueprintName, blueprintMethod] of Object.entries(blueprintMethods)) {
      blueprintsBound[blueprintNamespace][blueprintName] = blueprintMethod.bind(null, blueprintCtx);
    }
  }

  return new Omnibus(network, items({ ...blueprintCtx, blueprints: blueprintsBound }), test, meta);
}

function createCall({ voting }: LidoContracts) {
  return function call<T extends Contract, N extends ExtractAbiFunctionNames<T["abi"]>>(
    contract: T,
    functionName: N,
    args: FindFunctionAbiParams<T["abi"], N>,
    options: { title: string; events: ContractEvent[]; value?: bigint },
  ): OmnibusDirectCall {
    return new OmnibusDirectCall({
      voting,
      contract,
      functionName,
      args,
      callEvents: options.events,
      title: options.title,
      value: options.value ?? 0n,
    });
  };
}

function createForward(contracts: LidoContracts) {
  return function forward<T extends Contract>(
    forwarder: HasForwardMethod<T["abi"]> extends true ? T : never,
    calls: OmnibusDirectCall[],
  ): OmnibusForwardCall {
    return new OmnibusForwardCall(forwarder, calls);
  };
}

function createExecute() {
  return function execute(executor: Contract<typeof Agent_ABI>, call: OmnibusDirectCall): OmnibusExecuteCall {
    return new OmnibusExecuteCall(executor, call);
  };
}

function createSubmitProposal({ callsScript, voting, emergencyProtectedTimelock, adminExecutor }: LidoContracts) {
  return function submitProposal<T extends Contract>(
    governance: HasSubmitProposal<T["abi"]> extends true ? T : never,
    options: {
      description: string;
      calls: (OmnibusDirectCall | OmnibusForwardCall | OmnibusExecuteCall)[];
    },
  ): OmnibusSubmitProposalCall {
    return new OmnibusSubmitProposalCall({
      executor: adminExecutor,
      voting,
      governance,
      callsScript,
      proposer: voting,
      timelock: emergencyProtectedTimelock,
      description: options.description,
      calls: options.calls,
    });
  };
}

export function event<T extends Contract, N extends FilterAbiEvents<T["abi"]>["name"]>(
  contract: T,
  eventName: N,
  args: PartialArray<FindEventAbiParams<T["abi"], N>>,
  options: { emitter?: Address; isOptional?: boolean } = {},
): ContractEvent {
  return {
    abi: getEventAbi(contract, eventName),
    emitter: options.emitter ?? contract.address,
    args: args as unknown[],
    isOptional: options.isOptional ?? false,
  };
}
