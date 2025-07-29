import { AbiEvent, Address } from "abitype";
import { EvmScriptParser } from "../aragon-votes-tools";
import bytes from "../common/bytes";
import { DevRpcClient, NetworkName } from "../network";
import { TxTrace } from "../traces/tx-traces";
import { OmnibusDirectCall } from "./calls/omnibus-direct-call";
import { OmnibusExecuteCall } from "./calls/omnibus-execute-call";
import { OmnibusForwardCall } from "./calls/omnibus-forward-call";
import { OmnibusSubmitProposalCall } from "./calls/omnibus-submit-proposal-call";
import { createOmnibus, OmnibusPlan } from "./tools/create-omnibus";
import { OmnibusTestFn, testOmnibus } from "./tools/test-omnibus";

export type OmnibusCall = OmnibusDirectCall | OmnibusForwardCall | OmnibusSubmitProposalCall | OmnibusExecuteCall;

export interface OmnibusMetaArgs {
  voteId?: number;
  launchedOn?: number;
  quorumReached?: boolean;
  executedOn?: number;
  description: string;
}

export interface ContractEvent {
  abi: AbiEvent;
  args: unknown[];
  emitter: Address;
  isOptional: boolean;
}

interface OmnibusFormatParams {
  executeOmnibusTrace?: TxTrace;
  executeProposalTraces?: TxTrace[];
  padLength?: number;
}

export class Omnibus<N extends NetworkName = NetworkName> {
  static create<N extends NetworkName>(plan: OmnibusPlan<N>) {
    return createOmnibus(plan);
  }

  static test<N extends NetworkName>(omnibus: Omnibus<N>, testFn: OmnibusTestFn<N>) {
    return testOmnibus(omnibus, testFn);
  }

  public readonly network: N;
  public readonly calls: OmnibusCall[];

  public readonly voteId?: number;
  public readonly launchedOn?: number;
  public readonly quorumReached?: boolean;
  public readonly executedOn?: number;
  public readonly description: string;
  private readonly testFn: OmnibusTestFn<N>;

  constructor(network: N, calls: OmnibusCall[], testFn: OmnibusTestFn<N>, meta: OmnibusMetaArgs) {
    this.network = network;
    this.calls = calls;

    this.voteId = meta.voteId;
    this.launchedOn = meta.launchedOn;
    this.quorumReached = meta.quorumReached;
    this.executedOn = meta.executedOn;
    this.description = meta.description;
    this.testFn = testFn;
  }

  get script() {
    return EvmScriptParser.encode(
      this.calls.map((call) => ({
        address: call.target,
        calldata: call.calldata,
      })),
    );
  }

  get events() {
    return this.calls.map((call) => call.events);
  }

  formatSummary(descriptionLink?: string, padLength: number = 0) {
    const summaryItems = this.calls.map((call, ind) => call.formatTitle(`${ind + 1}`, padLength));
    return descriptionLink ? [...summaryItems, "", descriptionLink].join("\n") : summaryItems.join("\n");
  }

  format({ executeOmnibusTrace, executeProposalTraces = [], padLength = 0 }: OmnibusFormatParams) {
    const strBuilder: string[] = [];
    const callTraces = executeOmnibusTrace ? groupOmnibusTraceCalls(this.calls, executeOmnibusTrace) : [];

    let executeProposalTraceIndex = 0;
    for (let i = 0; i < this.calls.length; ++i) {
      const callIndex = `${i + 1}`;
      const callTrace = callTraces[i];
      const omnibusCall = this.calls[i];

      if (omnibusCall instanceof OmnibusSubmitProposalCall) {
        strBuilder.push(omnibusCall.format(callIndex, executeProposalTraces[executeProposalTraceIndex], padLength));
        executeProposalTraceIndex += 1;
      } else {
        strBuilder.push(omnibusCall.format(callIndex, callTrace, padLength));
      }
      strBuilder.push("");
    }
    return strBuilder.join("\n");
  }

  async test(client: DevRpcClient) {
    return testOmnibus(this, this.testFn)(client);
  }
}

export function groupOmnibusTraceCalls(items: OmnibusCall[], trace: TxTrace) {
  let voteCallIndices: number[] = [];

  const callTraces: TxTrace[] = [];
  for (let i = 0; i < items.length; ++i) {
    const { target, calldata } = items[i];
    const startIndex = trace.calls.findIndex(
      (opCode) =>
        (opCode.type === "CALL" || opCode.type === "DELEGATECALL") &&
        bytes.isEqual(opCode.address, target) &&
        bytes.isEqual(opCode.input, calldata),
    );
    voteCallIndices.push(startIndex);
  }

  for (let ind = 0; ind < voteCallIndices.length; ++ind) {
    callTraces.push(trace.slice(voteCallIndices[ind], voteCallIndices[ind + 1]));
  }

  if (items.length !== callTraces.length) {
    throw new Error("Unexpected call traces length");
  }
  return callTraces;
}
