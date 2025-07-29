import { encodeFunctionData } from "viem";
import { Voting_ABI } from "../../../abi/Voting.abi";
import { Contract, getEventAbi } from "../../contracts/contracts";
import { DualGovernance_ABI } from "../../../abi/DualGovernance.abi";
import { CallsScript_ABI } from "../../../abi/CallsScript.abi";
import { EmergencyProtectedTimelock_ABI } from "../../../abi/EmergencyProtectedTimelock.abi";
import fmt from "../../common/format";
import { TxTrace } from "../../traces/tx-traces";
import chalk from "chalk";
import bytes from "../../common/bytes";
import { OmnibusExecuteCall } from "./omnibus-execute-call";
import { Executor_ABI } from "../../../abi/Executor.abi";
import { OmnibusForwardCall } from "./omnibus-forward-call";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { ContractEvent } from "../omnibus";

interface OmnibusSubmitProposalCallParams {
  executor: Contract<typeof Executor_ABI>;
  voting: Contract<typeof Voting_ABI>;
  timelock: Contract;
  governance: Contract;
  callsScript: Contract;
  proposer: Contract;
  description: string;
  calls: (OmnibusDirectCall | OmnibusForwardCall | OmnibusExecuteCall)[];
}

export class OmnibusSubmitProposalCall {
  public readonly voting: Contract<typeof Voting_ABI>;
  public readonly timelock: Contract;
  public readonly governance: Contract;
  public readonly callsScript: Contract;
  public readonly proposer: Contract;
  public readonly executor: Contract<typeof Executor_ABI>;

  public readonly description: string;
  public readonly calls: (OmnibusDirectCall | OmnibusForwardCall | OmnibusExecuteCall)[];

  constructor(params: OmnibusSubmitProposalCallParams) {
    this.executor = params.executor;
    this.voting = params.voting;
    this.proposer = params.proposer;
    this.timelock = params.timelock;
    this.governance = params.governance;
    this.callsScript = params.callsScript;

    this.calls = params.calls;
    this.description = params.description;
  }

  get target() {
    return this.governance.address;
  }

  get calldata() {
    return encodeFunctionData({
      abi: DualGovernance_ABI,
      functionName: "submitProposal",
      args: [this.proposalCalls, this.description],
    });
  }

  get proposalCalls() {
    return this.calls.map((call) => ({ target: call.target, value: call.value, payload: call.calldata }));
  }

  get events(): ContractEvent[] {
    const logScriptCallAbi = getEventAbi({ abi: CallsScript_ABI }, "LogScriptCall");
    const governanceProposalSubmittedAbi = getEventAbi({ abi: DualGovernance_ABI }, "ProposalSubmitted");
    const timelockProposalSubmittedAbi = getEventAbi({ abi: EmergencyProtectedTimelock_ABI }, "ProposalSubmitted");

    return [
      {
        abi: logScriptCallAbi,
        emitter: this.proposer.address,
        args: [/* sender: */ null, /* src: */ this.proposer.address, /* dst: */ this.governance.address],
        isOptional: false,
      },
      {
        abi: timelockProposalSubmittedAbi,
        emitter: this.timelock.address,
        args: [/* id */ null, /* executor: */ null, /* calls: */ this.proposalCalls],
        isOptional: false,
      },
      {
        abi: governanceProposalSubmittedAbi,
        emitter: this.governance.address,
        args: [/* proposerAccount: */ this.proposer.address, /* proposalId: */ null, /* metadata: */ this.description],
        isOptional: false,
      },
    ];
  }

  formatCall(padLength: number = 0) {
    return fmt.decodedFuncCall({
      contract: this.governance,
      args: [this.proposalCalls, this.description],
      functionName: "submitProposal",
      padLength,
    });
  }

  formatTitle(id?: string, padLength: number = 0) {
    const strBuilder: string[] = [];

    strBuilder.push(
      fmt.padded(
        `${id}. Submit proposal to ${this.governance.label} (${this.governance.address}) with calls:`,
        padLength,
      ),
    );

    return [...strBuilder, ...this.calls.map((call, ind) => call.formatTitle(`${id}.${ind + 1}`, padLength + 1))].join(
      "\n",
    );
  }

  format(index?: string, trace?: TxTrace, padLength: number = 0) {
    const strBuilder: string[] = [];

    strBuilder.push(
      fmt.padded(
        chalk.green.bold(
          `${index}. Submit proposal to ${this.governance.label} (${this.governance.address}) with ${this.calls.length} calls:`,
        ),
        padLength,
      ),
    );

    strBuilder.push(this.formatCall(padLength + 1));
    strBuilder.push(fmt.padded(`Calls to execute:`, padLength + 1));

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

      const executorCallTrace = nestedCallTrace?.slice(0, 1);

      const id = `${index}.${j + 1}`;

      let callPadLength = padLength + 3;
      if (executorCallTrace) {
        strBuilder.push(chalk.green.bold(`${id}. `) + executorCallTrace.format(callPadLength).trimStart());
        callPadLength += 1;
      }
      strBuilder.push(call.format(id, nestedCallTrace?.slice(1), callPadLength));
    }

    return strBuilder.join("\n");
  }
}
