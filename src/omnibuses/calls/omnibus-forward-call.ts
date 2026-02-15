import { encodeFunctionData } from "viem";
import { Contract } from "../../contracts/contracts";
import fmt from "../../common/format";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { BaseOmnibusCall, DEFAULT_FORMAT_OPTIONS, event, OmnibusCallEvent } from "../omnibus";
import { EvmScriptParser } from "../../aragon-votes-tools";
import { ExtractAbiFunctionNames } from "abitype";
import { FindFunctionAbiParams } from "../../types/abi.types";
import chalk from "chalk";
import { AgentContract, CallsScriptContract, VotingContract } from "../governance-contracts";

export class OmnibusForwardCallFactory {
  public readonly voting: VotingContract;
  public readonly callsScript: CallsScriptContract;

  constructor(voting: VotingContract, callsScript: CallsScriptContract) {
    this.voting = voting;
    this.callsScript = callsScript;
  }

  create<$Contract extends Contract, $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]>>(
    title: string,
    forwarder: AgentContract,
    input: OmnibusForwardCallInput<$Contract, $FunctionName>,
  ): OmnibusForwardCall {
    return new OmnibusForwardCall(this.voting, this.callsScript, forwarder, title, input);
  }
}

export interface OmnibusForwardCallInput<
  $Contract extends Contract = Contract,
  $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]> = string,
> {
  on: $Contract;
  fn: $FunctionName;
  args: FindFunctionAbiParams<$Contract["abi"], $FunctionName>;
  events: OmnibusCallEvent[];
}

export class OmnibusForwardCall implements BaseOmnibusCall {
  public readonly forwarder: AgentContract;
  public readonly call: OmnibusDirectCall;

  readonly #callsScript: CallsScriptContract;

  constructor(
    voting: VotingContract,
    callsScript: CallsScriptContract,
    forwarder: AgentContract,
    title: string,
    input: OmnibusForwardCallInput,
  ) {
    this.call = new OmnibusDirectCall(voting, callsScript, title, input);
    this.forwarder = forwarder;
    this.#callsScript = callsScript;
  }

  getTarget() {
    return this.forwarder.address;
  }

  getCalldata() {
    return encodeFunctionData({
      abi: this.forwarder.abi,
      functionName: "forward",
      args: [this.getForwardingCallsScript()],
    });
  }

  getForwardingCallsScript() {
    return EvmScriptParser.encode([{ address: this.call.getTarget(), calldata: this.call.getCalldata() }]);
  }

  getExpectedEvents(phase: "vote" | "proposal"): OmnibusCallEvent[] {
    return [
      event(
        this.#callsScript,
        "LogScriptCall",
        [/* sender: */ null, /* src: */ this.forwarder.address, /* dst: */ this.call.getTarget()],
        { emitter: this.forwarder.address },
      ),
      ...this.call.getExpectedEvents(phase),
      event(this.forwarder, "ScriptResult", [
        /* executor: */ null,
        /* script: */ this.getForwardingCallsScript(),
        /* input: */ "0x",
        /* returnData: */ "0x",
      ]),
    ];
  }

  formatCall({ padLength } = DEFAULT_FORMAT_OPTIONS) {
    return fmt.decodedFuncCall({
      contract: this.forwarder,
      args: [this.getForwardingCallsScript()],
      functionName: "forward",
      padLength: padLength,
    });
  }

  formatTitle({ padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    return this.call.formatTitle({ padLength });
  }

  format({ trace, padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    const strBuilder: string[] = [
      chalk.green.bold(this.call.formatTitle({ padLength })),
      this.formatCall({ padLength: padLength + 1 }),
      fmt.padded(chalk.bold.underline(`Forwarded Call:`), padLength + 1),
      this.call.formatCall({ padLength: padLength + 3 }),
    ];

    if (trace) {
      strBuilder.push(fmt.padded(chalk.bold.underline("Trace:"), padLength + 2));
      strBuilder.push(trace.format(padLength + 3));
    }

    return strBuilder.join("\n");
  }
}
