import chalk from "chalk";
import { Call, encodeFunctionData } from "viem";
import fmt from "../../common/format";
import { EvmScriptParser } from "../../aragon-votes-tools";
import { AgentContract, CallsScriptContract, Contract, getEventAbi } from "../../contracts/contracts";
import { CallsScript_ABI } from "../../../abi/CallsScript.abi";
import { OmnibusDirectCall } from "./omnibus-direct-call";
import { BaseOmnibusCall, DEFAULT_FORMAT_OPTIONS, event, groupOmnibusTraceCalls } from "../omnibus";

interface OmnibusForwardCallsContracts {
  callsScript: CallsScriptContract;
}

export class OmnibusForwardCalls implements BaseOmnibusCall {
  public readonly title: string;
  public readonly forwarder: AgentContract;
  public readonly forwardedCalls: OmnibusDirectCall[];
  readonly #callsScript: CallsScriptContract;

  public static createCallBuilder(contracts: OmnibusForwardCallsContracts) {
    return function forwardCalls(
      title: string,
      forwarder: AgentContract,
      calls: OmnibusDirectCall[],
    ): OmnibusForwardCalls {
      return new OmnibusForwardCalls(contracts, forwarder, calls, title);
    };
  }

  constructor(
    contracts: OmnibusForwardCallsContracts,
    forwarder: AgentContract,
    calls: OmnibusDirectCall[],
    title: string,
  ) {
    this.title = title;
    this.forwardedCalls = calls;
    this.forwarder = forwarder;

    this.#callsScript = contracts.callsScript;
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
    return EvmScriptParser.encode(
      this.forwardedCalls.map((call) => ({ address: call.getTarget(), calldata: call.getCalldata() })),
    );
  }

  getEventsFor(target: "omnibus" | "proposal") {
    return [
      ...this.forwardedCalls
        .map((call) => [
          event(
            this.#callsScript,
            "LogScriptCall",
            [/* sender: */ null, /* src: */ this.forwarder.address, /* dst: */ call.getTarget()],
            { emitter: this.forwarder.address },
          ),
          ...call.getEventsFor(target),
        ])
        .flat(),
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
    const strBuilder: string[] = [fmt.padded(this.title, padLength)];

    return [...strBuilder, ...this.forwardedCalls.map((call) => call.formatTitle({ padLength: padLength + 1 }))].join(
      "\n",
    );
  }

  format({ trace, padLength = 0 } = DEFAULT_FORMAT_OPTIONS) {
    const strBuilder: string[] = [fmt.padded(chalk.green.bold(this.title), padLength)];
    strBuilder.push(this.formatCall({ padLength: padLength + 1 }));

    const [extraCalls, nestedCallTraces] = trace ? groupOmnibusTraceCalls(this.forwardedCalls, trace) : [null, []];

    if (extraCalls !== null) {
      strBuilder.push(fmt.padded(chalk.bold.underline("Trace:"), padLength + 1));
      strBuilder.push(extraCalls.format(padLength + 2));
      strBuilder.push(fmt.padded(chalk.bold.underline("Forwarded Calls:"), padLength + 1));
    }

    strBuilder.push(
      ...this.forwardedCalls.map((call, ind) =>
        call.format({
          trace: nestedCallTraces[ind],
          padLength: padLength + 2,
        }),
      ),
    );
    return strBuilder.join("\n");
  }
}
