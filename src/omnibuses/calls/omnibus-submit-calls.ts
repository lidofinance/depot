import chalk from "chalk";
import { encodeFunctionData } from "viem";

import fmt from "../../common/format";
import bytes from "../../common/bytes";
import { TxTrace } from "../../traces/tx-traces";
import {
  VotingContract,
  TimelockContract,
  ExecutorContract,
  CallsScriptContract,
  DualGovernanceContract,
  TimelockedGovernanceContract,
} from "../../contracts/contracts";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { OmnibusExecuteCall } from "./omnibus-execute-call";
import { OmnibusForwardCalls } from "./omnibus-forward-calls";
import { BaseOmnibusCall, OmnibusCallEvent, DEFAULT_FORMAT_OPTIONS, event } from "../omnibus";
import { OmnibusForwardCall } from "./omnibus-forward-call";

interface OmnibusSubmitCallsContracts {
  voting: VotingContract;
  executor: ExecutorContract;
  timelock: TimelockContract;
  callsScript: CallsScriptContract;
}

type OmnibusSubmitCallsNestedCall =
  | OmnibusDirectCall
  | OmnibusExecuteCall
  | OmnibusExecuteCall
  | OmnibusForwardCall
  | OmnibusForwardCalls;

export class OmnibusSubmitProposalCall implements BaseOmnibusCall {
  public readonly voting: VotingContract;
  public readonly timelock: TimelockContract;
  public readonly governance: DualGovernanceContract | TimelockedGovernanceContract;
  public readonly callsScript: CallsScriptContract;
  public readonly executor: ExecutorContract;

  public readonly title: string;
  public readonly calls: OmnibusSubmitCallsNestedCall[];

  public static createCallBuilder(contracts: OmnibusSubmitCallsContracts) {
    return function submitCalls(
      title: string,
      governance: DualGovernanceContract | TimelockedGovernanceContract,
      calls: OmnibusSubmitCallsNestedCall[],
    ): OmnibusSubmitProposalCall {
      return new OmnibusSubmitProposalCall(contracts, title, governance, calls);
    };
  }

  constructor(
    contracts: OmnibusSubmitCallsContracts,
    title: string,
    governance: DualGovernanceContract | TimelockedGovernanceContract,
    calls: OmnibusSubmitCallsNestedCall[],
  ) {
    this.executor = contracts.executor;
    this.voting = contracts.voting;
    this.timelock = contracts.timelock;
    this.callsScript = contracts.callsScript;

    this.title = title;
    this.calls = calls;
    this.governance = governance;
  }

  getTarget() {
    return this.governance.address;
  }

  getCalldata() {
    return encodeFunctionData({
      abi: this.governance.abi,
      functionName: "submitProposal",
      args: [this.proposalCalls, this.formatTitle()],
    });
  }

  get proposalCalls() {
    return this.calls.map((call) => ({
      target: call.getTarget(),
      value: call instanceof OmnibusDirectCall ? call.getValue() : 0n,
      payload: call.getCalldata(),
    }));
  }

  getEventsFor(type: "omnibus" | "proposal"): OmnibusCallEvent[] {
    if (type === "omnibus") {
      return this.getSubmitEvents();
    } else if (type === "proposal") {
      return this.getExecutionEvents();
    }
    throw new Error("Unexpected type");
  }

  getExecutionEvents(): OmnibusCallEvent[] {
    return [
      ...this.calls.map((call) => {
        return [
          ...call.getEventsFor("proposal"),
          event(this.executor, "Executed", [
            /* target */ call.getTarget(),
            /* ethValue */ call instanceof OmnibusDirectCall ? call.getValue() : 0n,
            /* data */ call.getCalldata(),
            /* returndata*/ null,
          ]),
        ];
      }),
      event(this.timelock, "ProposalExecuted", [/* id */ null]),
    ].flat();
  }

  getSubmitEvents(): OmnibusCallEvent[] {
    return [
      event(
        this.callsScript,
        "LogScriptCall",
        [/* sender: */ null, /* src: */ this.voting.address, /* dst: */ this.governance.address],
        { emitter: this.voting.address },
      ),
      event(this.timelock, "ProposalSubmitted", [/* id */ null, /* executor: */ null, /* calls: */ this.proposalCalls]),
      event(this.governance, "ProposalSubmitted", [
        /* proposerAccount: */ this.voting.address,
        /* proposalId: */ null,
        /* metadata: */ this.formatTitle(),
      ]),
    ];
  }

  formatCall({ padLength } = DEFAULT_FORMAT_OPTIONS) {
    return fmt.decodedFuncCall({
      contract: this.governance,
      args: [this.proposalCalls, this.formatTitle()],
      functionName: "submitProposal",
      padLength,
    });
  }

  formatTitle({ padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    const strBuilder: string[] = [];

    strBuilder.push(fmt.padded(this.title, padLength));

    return [
      ...strBuilder,
      ...this.calls.map((call, ind) =>
        call.formatTitle({
          padLength: padLength + 1,
        }),
      ),
    ].join("\n");
  }

  format({ trace, padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    const strBuilder: string[] = [];

    strBuilder.push(fmt.padded(chalk.green.bold(this.title), padLength));

    strBuilder.push(this.formatCall({ padLength: padLength + 1 }));
    strBuilder.push(fmt.padded(chalk.bold.underline("Submitted Calls:"), padLength + 1));

    const nestedCallTraces: TxTrace[] = [];
    if (trace) {
      const executeCallIndices: number[] = [];
      for (let i = 0; i < trace.calls.length; ++i) {
        const callTraceItem = trace.calls[i];
        // group by Executor.execute() calls;
        if (
          bytes.isEqual(callTraceItem.address, this.executor.address) &&
          callTraceItem.type === "CALL" &&
          bytes.isEqual(bytes.slice(callTraceItem.input, 0, 4), "0xb61d27f6")
        ) {
          executeCallIndices.push(i);
        }
      }

      for (let i = 0; i < executeCallIndices.length; ++i) {
        nestedCallTraces.push(trace.slice(executeCallIndices[i], executeCallIndices[i + 1]));
      }
    }

    if (trace && nestedCallTraces.length !== this.calls.length) {
      throw new Error("Unexpected submit proposal calls count");
    }

    for (let j = 0; j < this.calls.length; ++j) {
      const call = this.calls[j];
      const nestedCallTrace = nestedCallTraces[j];

      strBuilder.push(call.format({ trace: nestedCallTrace, padLength: padLength + 2 }), "  ");
    }

    return strBuilder.join("\n");
  }
}
