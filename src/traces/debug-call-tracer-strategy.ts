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
    const raw = await this.#client.send("debug_traceTransaction", [
      txHash,
      { tracer: "callTracer", tracerConfig: { withLog: true } },
    ]);
    const callTrace = assertCallsTrace(raw, txHash);

    const result: TxTraceItem[] = [];
    this.#traceRecursive(callTrace, result);

    return result;
  }

  #traceRecursive(callsTrace: CallsTrace, result: TxTraceItem[], depth = 0) {
    result.push(this.#processCallTraceItem(depth, callsTrace));

    const logItems = callsTrace.logs ?? [];
    const nestedCallItems = callsTrace.calls ?? [];

    // log position is the count of nested calls made before the log was emitted
    let logIndex = 0;
    for (let callIndex = 0; callIndex < nestedCallItems.length; ++callIndex) {
      while (logIndex < logItems.length && Number(logItems[logIndex].position) <= callIndex) {
        result.push(this.#processCallTraceLog(logItems[logIndex], depth + 1));
        logIndex += 1;
      }
      this.#traceRecursive(nestedCallItems[callIndex], result, depth + 1);
    }
    for (const logItem of logItems.slice(logIndex)) {
      result.push(this.#processCallTraceLog(logItem, depth + 1));
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

const KNOWN_CALL_TRACE_TYPES: ReadonlySet<string> = new Set([
  "CALL",
  "DELEGATECALL",
  "STATICCALL",
  "CREATE",
  "CREATE2",
  "SELFDESTRUCT",
]);

function assertCallsTrace(raw: unknown, txHash: string): CallsTrace {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`debug_traceTransaction(${txHash}) returned non-object response`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.type !== "string" || !KNOWN_CALL_TRACE_TYPES.has(obj.type)) {
    throw new Error(`debug_traceTransaction(${txHash}) returned unexpected top-level type: ${String(obj.type)}`);
  }
  if (typeof obj.from !== "string" || typeof obj.to !== "string") {
    throw new Error(`debug_traceTransaction(${txHash}) returned missing/invalid from or to fields`);
  }
  return raw as CallsTrace;
}
