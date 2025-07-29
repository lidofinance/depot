import { encodeFunctionData } from "viem";
import { Contract, getEventAbi } from "../../contracts/contracts";
import fmt from "../../common/format";
import { TxTrace } from "../../traces/tx-traces";
import chalk from "chalk";
import { Agent_ABI } from "../../../abi/Agent.abi";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { ContractEvent, groupOmnibusTraceCalls } from "../omnibus";

type ExecutorContract = Contract<typeof Agent_ABI>;

export class OmnibusExecuteCall {
  public readonly value: bigint = 0n;
  public readonly executor: ExecutorContract;
  public readonly call: OmnibusDirectCall;

  constructor(executor: ExecutorContract, call: OmnibusDirectCall) {
    this.call = call;
    this.executor = executor;
  }

  get target() {
    return this.executor.address;
  }

  get calldata() {
    return encodeFunctionData({
      abi: this.executor.abi,
      functionName: "execute",
      args: [this.call.target, this.call.value, this.call.calldata],
    });
  }

  get events(): ContractEvent[] {
    const executeAbi = getEventAbi({ abi: Agent_ABI }, "Execute");
    return [
      ...this.call.events,
      {
        abi: executeAbi,
        emitter: this.executor.address,
        args: [
          /* sender */ null,
          /* target */ this.call.contract.address,
          /* ethValue */ this.call.value,
          /* data */ this.call.calldata,
        ],
        isOptional: false,
      },
    ];
  }

  formatCall(padLength: number = 0) {
    return fmt.decodedFuncCall({
      contract: this.executor,
      args: [this.call.target, this.call.value, this.call.calldata],
      functionName: "execute",
      padLength: padLength,
    });
  }

  formatTitle(id?: string, padLength: number = 0) {
    return [
      fmt.padded(`${id}. Execute call via ${this.executor.label} (${this.executor.address}):`, padLength),
      this.call.formatTitle(`${id}`, padLength + 1),
    ].join("\n");
  }

  format(id?: string, trace?: TxTrace, padLength: number = 0) {
    const strBuilder: string[] = [
      fmt.padded(
        chalk.green.bold(`${id}. Execute call via ${this.executor.label} (${this.executor.address}):`),
        padLength,
      ),
    ];
    strBuilder.push(this.formatCall(padLength + 1));

    const nestedCallTraces = trace ? groupOmnibusTraceCalls([this.call], trace) : [];
    strBuilder.push(this.call.format(`${id}`, nestedCallTraces[0], padLength + 1));
    return strBuilder.join("\n");
  }
}
