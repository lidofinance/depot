import { encodeFunctionData } from "viem";
import { EvmScriptParser } from "../../aragon-votes-tools";
import { Contract, getEventAbi } from "../../contracts/contracts";
import { CallsScript_ABI } from "../../../abi/CallsScript.abi";
import fmt from "../../common/format";
import { TxTrace } from "../../traces/tx-traces";
import chalk from "chalk";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { ContractEvent, groupOmnibusTraceCalls } from "../omnibus";

export class OmnibusForwardCall {
  public readonly value: bigint = 0n;
  public readonly forwarder: Contract;
  public readonly calls: OmnibusDirectCall[];

  constructor(forwarder: Contract, calls: OmnibusDirectCall[]) {
    this.calls = calls;
    this.forwarder = forwarder;
  }

  get target() {
    return this.forwarder.address;
  }

  get calldata() {
    return encodeFunctionData({
      abi: this.forwarder.abi,
      functionName: "forward",
      args: [this.forwardingCallsScript],
    });
  }

  get forwardingCallsScript() {
    return EvmScriptParser.encode(
      this.calls.map((call) => ({ address: call.contract.address, calldata: call.calldata })),
    );
  }

  get events(): ContractEvent[] {
    const logScriptCallAbi = getEventAbi({ abi: CallsScript_ABI }, "LogScriptCall");
    const scriptResultAbi = getEventAbi({ abi: this.forwarder.abi }, "ScriptResult");
    return [
      ...this.calls
        .map((call) => [
          {
            abi: logScriptCallAbi,
            emitter: this.forwarder.address,
            args: [/* sender: */ null, /* src: */ this.forwarder.address, /* dst: */ call.contract.address],
            isOptional: false,
          },
          ...call.callEvents,
        ])
        .flat(),
      {
        abi: scriptResultAbi,
        emitter: this.forwarder.address,
        args: [
          /* executor: */ null,
          /* script: */ this.forwardingCallsScript,
          /* input: */ "0x",
          /* returnData: */ "0x",
        ],
        isOptional: false,
      },
    ];
  }

  formatCall(padLength: number = 0) {
    return fmt.decodedFuncCall({
      contract: this.forwarder,
      args: [this.forwardingCallsScript],
      functionName: "forward",
      padLength: padLength,
    });
  }

  formatTitle(id?: string, padLength: number = 0) {
    const strBuilder: string[] = [
      fmt.padded(`${id}. Forward call(s) via ${this.forwarder.label} (${this.forwarder.address}):`, padLength),
    ];

    return [...strBuilder, ...this.calls.map((call, ind) => call.formatTitle(`${id}.${ind + 1}`, padLength + 1))].join(
      "\n",
    );
  }

  format(id?: string, trace?: TxTrace, padLength: number = 0) {
    const strBuilder: string[] = [
      fmt.padded(
        chalk.green.bold(`${id}. Forward call(s) via ${this.forwarder.label} (${this.forwarder.address}):`),
        padLength,
      ),
    ];
    strBuilder.push(this.formatCall(padLength + 1));

    const nestedCallTraces = trace ? groupOmnibusTraceCalls(this.calls, trace) : [];

    strBuilder.push(
      ...this.calls.map((call, ind) => call.format(`${id}.${ind + 1}`, nestedCallTraces[ind], padLength + 1) + "\n"),
    );
    return strBuilder.join("\n");
  }
}
