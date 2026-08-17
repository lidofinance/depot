import { AbiEvent, Address } from "abitype";
import { TransactionReceipt } from "viem";

import { HexStrNonPrefixed, HexStrPrefixed } from "../common/bytes";
import { DevRpcClient, NetworkName, RpcClient } from "../network";
import { TxTrace } from "../traces/tx-traces";
import { Contract } from "../contracts";
import { OmnibusDirectCall, OmnibusDirectCallFactory } from "./calls/omnibus-direct-call";
import { OmnibusExecuteCall, OmnibusExecuteCallFactory } from "./calls/omnibus-execute-call";
import { OmnibusForwardCall, OmnibusForwardCallFactory } from "./calls/omnibus-forward-call";
import { OmnibusForwardCalls, OmnibusForwardCallsFactory } from "./calls/omnibus-forward-calls";
import { OmnibusSubmitProposalCall, OmnibusSubmitProposalCallFactory } from "./calls/omnibus-submit-calls";
import { Blueprints } from "./blueprints";
import type checks from "./checks";
import type { event } from "./event-helpers";

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = Object.freeze({
  padLength: 0,
});

export interface FormatOptions {
  padLength?: number;
  trace?: TxTrace;
}

export interface BaseOmnibusCall {
  getTarget(): Address;
  getCalldata(): HexStrNonPrefixed;
  getExpectedEvents(phase: "vote" | "proposal"): OmnibusCallEvent[];
  format(formatOptions?: FormatOptions): string;
  formatTitle(formatOptions?: FormatOptions): string;
  formatCall(formatOptions?: FormatOptions): string;
}

export interface OmnibusCallEvent {
  abi: AbiEvent;
  args: unknown[];
  emitter: Address;
  isOptional: boolean;
  allowMultiple: boolean;
}

export type OmnibusCall =
  | OmnibusDirectCall
  | OmnibusForwardCall
  | OmnibusExecuteCall
  | OmnibusForwardCalls
  | OmnibusSubmitProposalCall;

export interface OmnibusFormatParams {
  executeOmnibusTrace?: TxTrace;
  executeProposalTraces?: TxTrace[];
  padLength?: number;
}

export type BlueprintCtx = Pick<OmnibusConfigCtx, "event" | "directCall">;

// The voting will be bound to the method at the construction of the omnibus
export interface OmnibusConfigCtx<$DeployedContracts extends Record<string, Contract> = Record<string, Contract>> {
  event: typeof event;
  directCall: OmnibusDirectCallFactory["create"];
  executeCall: OmnibusExecuteCallFactory["create"];
  forwardCall: OmnibusForwardCallFactory["create"];
  forwardCalls: OmnibusForwardCallsFactory["create"];
  submitCalls: OmnibusSubmitProposalCallFactory["create"];
  blueprints: Blueprints;
  deployment: $DeployedContracts;
}

export interface DeployOmnibusContractCtx {
  client: RpcClient;
  deployContract: <T extends Contract>(contractName: string, args: unknown[]) => Promise<T>;
}

export interface OmnibusConfig<$Network extends NetworkName, $DeployedContracts extends Record<string, Contract>> {
  network: $Network;

  /**
   * When the omnibus was launched, contains the id of the vote.
   */
  voteId?: number;

  /**
   * Contains the info about the omnibus launching - the number of the block where the omnibus was launched.
   */
  launchedAt?: number | undefined;
  /**
   * Contains the info about the omnibus quorum - was it reached during the vote or not.
   */
  quorumReached?: boolean;
  /**
   * Contains the info about the omnibus execution - the number of the block with execution transaction.
   */
  executedAt?: number | undefined;

  /**
   * Describes the calls of the vote in TypeScript. Omitted by a Solidity-first omnibus, which
   * describes them in its contract only — then the calls are read from the deployed contract.
   */
  calls?: (ctx: OmnibusConfigCtx<$DeployedContracts>) => OmnibusCall[];
  testVote: TestVoteFn<$DeployedContracts>;
  testProposal?: TestProposalFn<$DeployedContracts>;

  deploy?: (ctx: DeployOmnibusContractCtx) => Promise<$DeployedContracts>;
  deployment?: $DeployedContracts;
}

export interface VoteCall {
  title: string;
  target: Address;
  payload: HexStrPrefixed;
}

export interface TestVoteFn<$DeployedContracts extends Record<string, Contract>> {
  (ctx: TestVoteFnCtx<$DeployedContracts>): Promise<void>;
}

export interface PassProposalResult {
  executeReceipts: TransactionReceipt[];
}

export interface TestFnCommonCtx<$DeployedContracts extends Record<string, Contract>> {
  client: DevRpcClient;
  checks: BoundChecks;
  deployment: $DeployedContracts;
}

export interface TestVoteFnCtx<
  $DeployedContracts extends Record<string, Contract>,
> extends TestFnCommonCtx<$DeployedContracts> {
  passOmnibus: () => Promise<PassVoteResult>;
}

export interface TestProposalFnCtx<
  $DeployedContracts extends Record<string, Contract>,
> extends TestFnCommonCtx<$DeployedContracts> {
  submittedProposalIds: bigint[];
  passProposals: (proposalIds?: bigint[]) => Promise<PassProposalResult>;
}

export interface TestProposalFn<$DeployedContracts extends Record<string, Contract>> {
  (ctx: TestProposalFnCtx<$DeployedContracts>): Promise<void>;
}

export type BoundChecks = {
  [K in keyof typeof checks]: BindFirstParam<(typeof checks)[K]>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BindFirstParam<R extends Record<string, (...args: any[]) => any>> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [K in keyof R]: R[K] extends (first: any, ...rest: infer Args) => infer Return ? (...args: Args) => Return : never;
};

export interface PassVoteResult {
  voteId: bigint;
  executeReceipt: TransactionReceipt;
  submittedProposalIds: bigint[];
}
