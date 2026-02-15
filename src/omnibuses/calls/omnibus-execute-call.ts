import { encodeFunctionData } from "viem";
import fmt from "../../common/format";
import { Contract } from "../../contracts/contracts";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { BaseOmnibusCall, DEFAULT_FORMAT_OPTIONS, event, OmnibusCallEvent } from "../omnibus";
import { ExtractAbiFunctionNames } from "abitype";
import chalk from "chalk";
import { FindFunctionAbiParams } from "../../types/abi.types";
import { AgentContract, CallsScriptContract, VotingContract } from "../governance-contracts";

interface OmnibusExecuteCallInput<
  $Contract extends Contract = Contract,
  $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]> = string,
> {
  on: $Contract;
  value: bigint;
  fn: $FunctionName;
  args: FindFunctionAbiParams<$Contract["abi"], $FunctionName>;
  events: OmnibusCallEvent[];
}

export class OmnibusExecuteCallFactory {
  public readonly voting: VotingContract;
  public readonly callsScript: CallsScriptContract;

  constructor(voting: VotingContract, callsScript: CallsScriptContract) {
    this.voting = voting;
    this.callsScript = callsScript;
  }

  create<$Contract extends Contract, $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]>>(
    title: string,
    executor: AgentContract,
    input: OmnibusExecuteCallInput<$Contract, $FunctionName>,
  ): OmnibusExecuteCall {
    return new OmnibusExecuteCall(this.voting, this.callsScript, title, executor, input);
  }
}

export class OmnibusExecuteCall implements BaseOmnibusCall {
  public readonly executor: AgentContract;

  public readonly call: OmnibusDirectCall;

  constructor(
    voting: VotingContract,
    callsScript: CallsScriptContract,
    title: string,
    executor: AgentContract,
    input: OmnibusExecuteCallInput,
  ) {
    this.call = new OmnibusDirectCall(voting, callsScript, title, input);
    this.executor = executor;
  }

  get title() {
    return this.call.title;
  }

  getValue() {
    return this.call.getValue();
  }

  getTarget() {
    return this.executor.address;
  }

  getCalldata() {
    return encodeFunctionData({
      abi: this.executor.abi,
      functionName: "execute",
      args: [
        /* _target */ this.call.getTarget(),
        /* _ethValue */ this.call.getValue(),
        /* _data */ this.call.getCalldata(),
      ],
    });
  }

  getExpectedEvents(phase: "vote" | "proposal"): OmnibusCallEvent[] {
    return [
      ...this.call.getExpectedEvents(phase),
      event(this.executor, "Execute", [
        /* sender */ null,
        /* target */ this.call.getTarget(),
        /* ethValue */ this.call.getValue(),
        /* data */ this.call.getCalldata(),
      ]),
    ];
  }

  formatCall({ padLength } = DEFAULT_FORMAT_OPTIONS) {
    return fmt.decodedFuncCall({
      contract: this.executor,
      args: [this.call.getTarget(), this.call.getValue(), this.call.getCalldata()],
      functionName: "execute",
      padLength: padLength,
    });
  }

  formatTitle(fmtOptions = DEFAULT_FORMAT_OPTIONS) {
    return this.call.formatTitle(fmtOptions);
  }

  format({ trace, padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    const strBuilder: string[] = [
      chalk.green.bold(this.call.formatTitle({ padLength })),
      this.formatCall({ padLength: padLength + 1 }),
      fmt.padded(chalk.bold.underline(`Executed Call:`), padLength + 1),
      this.call.formatCall({ padLength: padLength + 3 }),
    ];

    if (trace) {
      strBuilder.push(fmt.padded(chalk.bold.underline("Trace:"), padLength + 2));
      strBuilder.push(trace.format(padLength + 3));
    }

    return strBuilder.join("\n");
  }
}
