import chalk from "chalk";
import { encodeFunctionData } from "viem";

import fmt from "../../common/format";
import { Contract } from "../../contracts/contracts";
import { BaseOmnibusCall, OmnibusCallEvent, DEFAULT_FORMAT_OPTIONS, event } from "../omnibus";
import { ExtractAbiFunctionNames } from "abitype";
import { FindFunctionAbiParams } from "../../types/abi.types";
import { CallsScriptContract, VotingContract } from "../governance-contracts";

interface OmnibusDirectCallInput<
  $Contract extends Contract = Contract,
  $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]> = string,
> {
  on: $Contract;
  fn: $FunctionName;
  args: FindFunctionAbiParams<$Contract["abi"], $FunctionName>;
  events: OmnibusCallEvent[];
  value?: bigint;
}

export class OmnibusDirectCallFactory {
  public readonly voting: VotingContract;
  public readonly callsScript: CallsScriptContract;

  constructor(voting: VotingContract, callsScript: CallsScriptContract) {
    this.voting = voting;
    this.callsScript = callsScript;
  }

  create<$Contract extends Contract, $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]>>(
    title: string,
    input: OmnibusDirectCallInput<$Contract, $FunctionName>,
  ) {
    return new OmnibusDirectCall(this.voting, this.callsScript, title, input);
  }
}

export class OmnibusDirectCall implements BaseOmnibusCall {
  public readonly title: string;
  public readonly input: OmnibusDirectCallInput;

  readonly #voting: VotingContract;
  readonly #callsScript: CallsScriptContract;

  constructor(voting: VotingContract, callsScript: CallsScriptContract, title: string, input: OmnibusDirectCallInput) {
    this.#voting = voting;
    this.#callsScript = callsScript;

    this.title = title;
    this.input = Object.freeze(input);
  }

  getValue() {
    return this.input.value ?? 0n;
  }

  getTarget() {
    return this.input.on.address;
  }

  getCalldata() {
    return encodeFunctionData({
      abi: this.input.on.abi,
      args: this.input.args,
      functionName: this.input.fn,
    });
  }

  getExpectedEvents(phase: "vote" | "proposal"): OmnibusCallEvent[] {
    const events = this.#getEvents();

    if (phase === "vote") {
      return [
        event(
          this.#callsScript,
          "LogScriptCall",
          [/* sender */ null, /* src */ this.#voting.address, /* dst */ this.input.on.address],
          { emitter: this.#voting.address },
        ),
        ...events,
      ];
    }

    if (phase === "proposal") {
      return events;
    }

    throw new Error(`Unexpected omnibus phase ${phase}`);
  }

  formatCall({ padLength } = DEFAULT_FORMAT_OPTIONS) {
    return fmt.decodedFuncCall({
      args: this.input.args,
      contract: this.input.on,
      functionName: this.input.fn,
      padLength: padLength,
    });
  }

  format({ trace, padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    const strBuilder: string[] = [
      fmt.padded(chalk.green.bold(this.title), padLength),
      this.formatCall({ padLength: padLength + 1 }),
    ];
    if (trace) {
      strBuilder.push(fmt.padded(chalk.bold.underline("Trace:"), padLength + 1), trace.format(padLength + 2));
    }
    return strBuilder.join("\n");
  }

  formatTitle({ padLength } = DEFAULT_FORMAT_OPTIONS) {
    return fmt.padded(this.title, padLength);
  }

  #getEvents() {
    return this.input.events;
  }
}
