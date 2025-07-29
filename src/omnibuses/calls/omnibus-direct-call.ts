import chalk from "chalk";
import fmt from "../../common/format";
import { TxTrace } from "../../traces/tx-traces";
import { encodeFunctionData } from "viem";
import { Contract, getEventAbi } from "../../contracts/contracts";
import { CallsScript_ABI } from "../../../abi/CallsScript.abi";
import { Voting_ABI } from "../../../abi/Voting.abi";
import { ContractEvent } from "../omnibus";

interface OmnibusDirectCallArgs {
  title: string;
  voting: Contract<typeof Voting_ABI>;
  contract: Contract;
  functionName: string;
  args: unknown[];
  callEvents: ContractEvent[];
  value?: bigint;
}

export class OmnibusDirectCall {
  public readonly voting: Contract<typeof Voting_ABI>;
  public readonly contract: Contract;

  public readonly title: string;
  public readonly functionName: string;
  public readonly args: unknown[];
  public readonly callEvents: ContractEvent[];
  public readonly value: bigint;

  constructor({ voting, title, args, contract, functionName, callEvents: events, value = 0n }: OmnibusDirectCallArgs) {
    this.voting = voting;
    this.contract = contract;
    this.args = args;
    this.title = title;
    this.callEvents = events;
    this.functionName = functionName;
    this.value = value;
  }

  get events() {
    return [
      {
        abi: getEventAbi({ abi: CallsScript_ABI }, "LogScriptCall"),
        emitter: this.voting.address,
        args: [null, null, null],
        isOptional: false,
      },
      ...this.callEvents,
    ];
  }

  get target() {
    return this.contract.address;
  }

  get calldata() {
    return encodeFunctionData({
      abi: this.contract.abi,
      args: this.args,
      functionName: this.functionName,
    });
  }

  formatCall(padLength: number = 0) {
    return fmt.decodedFuncCall({
      args: this.args,
      contract: this.contract,
      functionName: this.functionName,
      padLength: padLength,
    });
  }

  format(id?: string, trace?: TxTrace, padLength: number = 0) {
    const strBuilder: string[] = [
      fmt.padded(chalk.green.bold(`${id}. ${this.title}`), padLength),

      this.formatCall(padLength + 1),
    ];
    if (trace) {
      strBuilder.push(fmt.padded("Trace:", padLength + 1), trace.format(padLength + 2));
    }
    return strBuilder.join("\n");
  }

  formatTitle(id?: string, padLength: number = 0) {
    return fmt.padded(`${id}. ${this.title}`, padLength);
  }
}
