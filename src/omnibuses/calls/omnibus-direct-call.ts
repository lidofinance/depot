import chalk from "chalk";
import { encodeFunctionData } from "viem";

import fmt from "../../common/format";
import { CallsScriptContract, Contract, LidoContracts, VotingContract } from "../../contracts/contracts";
import { BaseOmnibusCall, OmnibusCallEvent, DEFAULT_FORMAT_OPTIONS, event } from "../omnibus";
import { ExtractAbiFunctionNames } from "abitype";
import { FindFunctionAbiParams } from "../../types/abi.types";

interface OmnibusDirectCallContracts {
  voting: VotingContract;
  callsScript: CallsScriptContract;
}

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

export class OmnibusDirectCall implements BaseOmnibusCall {
  public readonly title: string;
  public readonly functionName: string;
  public readonly args: readonly unknown[];

  readonly #value: bigint;
  readonly #target: Contract;
  readonly #events: OmnibusCallEvent[];

  readonly #voting: VotingContract;
  readonly #callsScript: CallsScriptContract;

  static createCallBuilder({ voting, callsScript }: OmnibusDirectCallContracts) {
    return function directCall<
      $Contract extends Contract,
      $FunctionName extends ExtractAbiFunctionNames<$Contract["abi"]>,
    >(title: string, input: OmnibusDirectCallInput<$Contract, $FunctionName>): OmnibusDirectCall {
      return new OmnibusDirectCall({ voting, callsScript }, title, input);
    };
  }

  constructor(contracts: OmnibusDirectCallContracts, title: string, input: OmnibusDirectCallInput) {
    this.title = title;
    this.args = input.args;
    this.functionName = input.fn;

    this.#voting = contracts.voting;
    this.#callsScript = contracts.callsScript;

    this.#events = input.events;
    this.#value = input.value ?? 0n;
    this.#target = input.on;
  }

  getValue() {
    return this.#value;
  }

  getTarget() {
    return this.#target.address;
  }

  getCalldata() {
    return encodeFunctionData({
      abi: this.#target.abi,
      args: this.args,
      functionName: this.functionName,
    });
  }

  getEventsFor(target: "omnibus" | "proposal") {
    if (target === "omnibus") {
      return [
        event(
          this.#callsScript,
          "LogScriptCall",
          [/* sender */ null, /* src */ this.#voting.address, /* dst */ this.#target.address],
          { emitter: this.#voting.address },
        ),
        ...this.#events,
      ];
    } else if (target === "proposal") {
      return this.#events;
    }
    throw new Error("Unexpected target type");
  }

  formatCall({ padLength } = DEFAULT_FORMAT_OPTIONS) {
    return fmt.decodedFuncCall({
      args: this.args,
      contract: this.#target,
      functionName: this.functionName,
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
}
