import { Address } from "viem";

import { RpcClient } from "../network";
import { TraceStrategy } from "./types";
import { HexStrPrefixed } from "../common/bytes";
import { TxTraceItem, TxTraceLogItem } from "./tx-traces";
import { CallEvmOpcodes, CreateEvmOpcodes, SelfDestructEvmOpcodes, LogEvmOpcodes } from "./evm-opcodes";

interface CallsTraceLog {
  address: Address;
  topics: HexStrPrefixed[];
  data: HexStrPrefixed;
  position: HexStrPrefixed;
}

interface CallsTrace {
  type: CallEvmOpcodes | CreateEvmOpcodes | SelfDestructEvmOpcodes;
  from: Address;
  to: Address;
  value?: HexStrPrefixed;
  gas: HexStrPrefixed;
  gasUsed: HexStrPrefixed;
  input: HexStrPrefixed;
  output?: HexStrPrefixed;
  error?: string;
  revertReason?: string;
  calls?: CallsTrace[];
  logs?: CallsTraceLog[];
}

export class DebugCallTracerStrategy implements TraceStrategy {
  #client: RpcClient;

  constructor(client: RpcClient) {
    this.#client = client;
  }

  async trace(txHash: HexStrPrefixed): Promise<TxTraceItem[]> {
    const callTrace: CallsTrace = await this.#client.send("debug_traceTransaction", [
      txHash,
      { tracer: "callTracer", tracerConfig: { withLog: true } },
    ]);

    const result: TxTraceItem[] = [];
    this.#traceRecursive(callTrace, result);

    return result;
  }

  #traceRecursive(callsTrace: CallsTrace, result: TxTraceItem[], depth = 0, index = 0) {
    result.push(this.#processCallTraceItem(depth, callsTrace));

    const logItems = callsTrace.logs ?? [];
    const nestedCallItems = callsTrace.calls ?? [];

    let logIndex = 0;
    let callIndex = 0;
    let itemsOrderIndex = 0;
    const traceItemsOrder: { type: "log" | "call"; index: number }[] = [];

    while (itemsOrderIndex < logItems.length + nestedCallItems.length) {
      if (logIndex < logItems.length) {
        const logItem = logItems[logIndex];
        const logPosition = Number(logItem.position);
        if (logPosition <= callIndex) {
          traceItemsOrder[itemsOrderIndex] = { type: "log", index: logIndex };
          logIndex += 1;
          itemsOrderIndex += 1;
        }
      }
      if (callIndex < nestedCallItems.length) {
        traceItemsOrder[itemsOrderIndex] = { type: "call", index: callIndex };
        callIndex += 1;
        itemsOrderIndex += 1;
      }
    }

    for (let i = 0; i < traceItemsOrder.length; ++i) {
      const item = traceItemsOrder[i];
      if (item.type === "log") {
        result.push(this.#processCallTraceLog(logItems[item.index], depth + 1));
      } else if (item.type === "call") {
        this.#traceRecursive(nestedCallItems[item.index], result, depth + 1);
      } else {
        throw new Error("unknown type");
      }
    }
  }

  #processCallTraceLog(callTraceLogItem: CallsTraceLog, depth: number) {
    const topicsCount = callTraceLogItem.topics.length;
    if (topicsCount > 4) {
      throw new Error("Invalid topics count");
    }
    const logType = ("LOG" + topicsCount) as LogEvmOpcodes;
    const logItem = {
      type: logType,
      depth,
      topics: callTraceLogItem.topics,
      data: callTraceLogItem.data,
      address: callTraceLogItem.address,
    } as TxTraceLogItem;
    return logItem;
  }

  #processCallTraceItem(depth: number, callTraceItem: CallsTrace) {
    if (callTraceItem.type === "CALL" || callTraceItem.type === "DELEGATECALL" || callTraceItem.type === "STATICCALL") {
      return {
        type: callTraceItem.type,
        depth,
        value: BigInt(callTraceItem.value ?? 0),
        gasSpent: Number(callTraceItem.gasUsed),
        gasProvided: Number(callTraceItem.gas),
        address: callTraceItem.to,
        success: !callTraceItem.error,
        input: callTraceItem.input,
        output: callTraceItem.output ?? "0x",
        gasLimit: Number(callTraceItem.gas),
      };
    }
    if (callTraceItem.type === "CREATE" || callTraceItem.type === "CREATE2") {
      return {
        type: callTraceItem.type,
        depth,
        value: BigInt(callTraceItem.value ?? 0),
        gasSpent: Number(callTraceItem.gasUsed),
        gasProvided: Number(callTraceItem.gas),
        address: callTraceItem.to,
        success: !callTraceItem.error,
        input: callTraceItem.input,
        output: callTraceItem.output ?? "0x",
      };
    }
    if (callTraceItem.type === "SELFDESTRUCT") {
      return {
        type: callTraceItem.type,
        depth,
        address: callTraceItem.to,
        beneficiary: callTraceItem.input,
      };
    }
    throw new Error("Unsupported call trace type");
  }
}
