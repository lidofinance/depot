import { AbiEvent, Address } from "abitype";
import { TransactionReceipt } from "viem";

import { HexStrPrefixed } from "../common/bytes";
import { DevRpcClient, NetworkName, RpcClient } from "../network";
import { TxTrace } from "../traces/tx-traces";
import { Contract } from "../contracts";
import type checks from "./checks";
import type { LogCollector } from "./log-collector";
import type { ProposalEvents, VoteEvents } from "./vote-events";

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = Object.freeze({
  padLength: 0,
});

export interface FormatOptions {
  padLength?: number;
  trace?: TxTrace;
}

export interface OmnibusCallEvent {
  abi: AbiEvent;
  args: unknown[];
  emitter: Address;
  isOptional: boolean;
  allowMultiple: boolean;
}

export interface OmnibusFormatParams {
  executeOmnibusTrace?: TxTrace;
  executeProposalTraces?: TxTrace[];
  padLength?: number;
}

export interface DeployOmnibusContractCtx {
  client: RpcClient;
  deployContract: <T extends Contract>(contractName: string, args: unknown[]) => Promise<T>;
}

export interface UpgradeSnapshotHooks {
  beforeExecution: () => Promise<void>;
  afterExecution: () => Promise<void>;
}

export interface OmnibusConfig<$Network extends NetworkName, $DeployedContracts extends Record<string, Contract>> {
  network: $Network;
  /** Whether the vote upgrades the protocol; `omnibus:test` then runs every upgrade snapshot suite. */
  upgrade: boolean;

  /** Recorded by `omnibus:launch --broadcast`: the id of the Aragon vote. */
  voteId?: number;

  testVote: TestVoteFn<$DeployedContracts>;
  testProposal?: TestProposalFn<$DeployedContracts>;
  /** Final-state assertions after the whole vote is applied; also the check of an already executed vote. */
  testFinalState?: TestFinalStateFn<$DeployedContracts>;

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
  logs: LogCollector[];
  proposalEvents: ProposalEvents[];
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

export interface TestFinalStateFn<$DeployedContracts extends Record<string, Contract>> {
  (ctx: TestFnCommonCtx<$DeployedContracts>): Promise<void>;
}

/** Where the vote is on chain; `omnibus:test` picks its checks by it. */
export type VoteStage = "not-launched" | "voting" | "dg-pending" | "executed";

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
  logs: LogCollector;
  voteEvents: VoteEvents;
}
